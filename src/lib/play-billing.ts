// Google Play subscriptions, the pure part.
//
// The Android app sells the subscription through Google Play (Google
// forbids any other payment inside an app). RevenueCat sits in between: the
// app buys through its SDK with the Supabase user id as the customer id,
// RevenueCat validates the purchase with Google and tells us through a
// webhook. Like the Stripe webhook, we never trust the event itself: every
// write re-reads the customer from RevenueCat (play-billing-server.ts) and
// turns it into a user_subscriptions row with the functions below.
//
// One row per user, whoever sold the subscription: `source` says which
// seller owns the row (supabase-migration-subscription-source.sql).

export type SubscriptionSource = "stripe" | "play";

/** A subscription in RevenueCat's "Get customer" answer (API v1). */
export type RcSubscription = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  /** normal | trial | intro | promotional | prepaid */
  period_type?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
  store?: string | null;
  store_transaction_id?: string | number | null;
  /** Google Play's base plan, e.g. "weekly" (products set up after Feb 2023). */
  product_plan_identifier?: string | null;
};

export type RcEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  product_plan_identifier?: string | null;
};

export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement> | null;
  subscriptions?: Record<string, RcSubscription> | null;
};

/** What a RevenueCat customer means for our table. */
export type PlayState =
  /** Never bought anything that grants the entitlement. */
  | { kind: "none" }
  | {
      kind: "subscription";
      /** Grants access right now. */
      active: boolean;
      status: "trialing" | "active" | "past_due" | "canceled";
      plan: "weekly" | "annual" | null;
      /** "<subscription>:<base plan>", or the product alone. */
      storeProductId: string;
      /** Google's order id, needed to cancel through RevenueCat. */
      storeTransactionId: string | null;
      /** When access ends or renews. Null: no end date (a granted entitlement). */
      periodEnd: string | null;
      /** The person cancelled: it ends instead of renewing. */
      endsInsteadOfRenewing: boolean;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Which plan a Google Play product is. The ids are ours (one subscription,
 * base plans "weekly" and "annual": docs/play-store-listing.md) and can
 * never be renamed, but the period words are matched loosely so a plan
 * added later ("annual-2027") still reads as its period.
 */
export function planFromPlayProduct(
  productId: string | null | undefined,
): "weekly" | "annual" | null {
  if (!productId) return null;
  const id = productId.toLowerCase();
  // "<subscription>:<base plan>": the base plan decides when there is one.
  const plan = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  if (/annual|year|p1y/.test(plan)) return "annual";
  if (/week|p1w/.test(plan)) return "weekly";
  return null;
}

function ms(date: string | null | undefined): number | null {
  if (!date) return null;
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : null;
}

/**
 * Read one RevenueCat customer. Access follows the ENTITLEMENT, which is
 * what RevenueCat computes from Google's answer (grace period included):
 * a customer without it has no access, whatever its purchases say.
 */
export function playStateFromSubscriber(
  subscriber: RcSubscriber | null | undefined,
  entitlementId: string,
  nowMs: number,
): PlayState {
  const entitlement = subscriber?.entitlements?.[entitlementId];
  const productId = entitlement?.product_identifier;
  if (!entitlement || !productId) return { kind: "none" };

  const subscription = subscriber?.subscriptions?.[productId] ?? {};
  const basePlan =
    subscription.product_plan_identifier ?? entitlement.product_plan_identifier ?? null;
  const storeProductId = basePlan ? `${productId}:${basePlan}` : productId;

  // No end date at all: an entitlement granted by hand in RevenueCat.
  const noEnd = entitlement.expires_date == null;
  const ends = Math.max(
    ms(entitlement.expires_date) ?? 0,
    ms(entitlement.grace_period_expires_date) ?? 0,
  );
  const refunded = ms(subscription.refunded_at) !== null;
  const active = !refunded && (noEnd || ends > nowMs);

  let status: "trialing" | "active" | "past_due" | "canceled";
  if (active) {
    status = subscription.period_type?.toLowerCase() === "trial" ? "trialing" : "active";
  } else {
    // Ended on a failed payment: the screen says so instead of "canceled".
    status = !refunded && subscription.billing_issues_detected_at ? "past_due" : "canceled";
  }

  const transaction = subscription.store_transaction_id;
  return {
    kind: "subscription",
    active,
    status,
    plan: planFromPlayProduct(storeProductId),
    storeProductId,
    storeTransactionId: transaction == null ? null : String(transaction),
    periodEnd: noEnd ? null : new Date(ends).toISOString(),
    endsInsteadOfRenewing: Boolean(subscription.unsubscribe_detected_at),
  };
}

/** The fields of a RevenueCat webhook event that name customers. */
export type RcEvent = {
  type?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  aliases?: unknown;
  transferred_from?: unknown;
  transferred_to?: unknown;
};

/**
 * Every Linette account an event is about. The app always identifies the
 * customer by the Supabase user id, so anything that is not a UUID (an
 * anonymous RevenueCat id, the dashboard's test event) is nobody of ours.
 * A TRANSFER names both sides: the account that lost the purchase must be
 * re-read as well.
 */
export function userIdsFromEvent(event: RcEvent | null | undefined): string[] {
  if (!event || typeof event !== "object") return [];
  const candidates: unknown[] = [event.app_user_id, event.original_app_user_id];
  for (const list of [event.aliases, event.transferred_from, event.transferred_to]) {
    if (Array.isArray(list)) candidates.push(...list);
  }
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (isUuid(candidate)) ids.add(candidate.toLowerCase());
  }
  return [...ids];
}

const GRANTS_ACCESS = new Set(["trialing", "active"]);

/**
 * May a seller write its state over the row? Its own row: always. The
 * other seller's row: only when the incoming subscription grants access,
 * or the row on file grants nothing. Without this, a late "deleted" event
 * for an old Stripe subscription would end a Google Play subscriber's
 * access (and the other way round).
 */
export function mayOverwrite(
  existing: { source?: string | null; status?: string | null } | null | undefined,
  incoming: { source: SubscriptionSource; active: boolean },
): boolean {
  if (!existing) return true;
  if ((existing.source ?? "stripe") === incoming.source) return true;
  if (incoming.active) return true;
  return !GRANTS_ACCESS.has(existing.status ?? "");
}

// ── What the paywall shows inside the app ──────────────────────────────

/** Days in a free trial given as an ISO 8601 period ("P7D", "P1W"). */
export function trialDaysFromPeriod(iso: string | null | undefined): number | null {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?$/i.exec(iso ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  const days = Number(match[1] ?? 0) * 7 + Number(match[2] ?? 0);
  return days > 0 ? days : null;
}

/** "Save N%": a year of the weekly price against the annual price. */
export function savePercent(weeklyPrice: number, annualPrice: number): number | null {
  if (!(weeklyPrice > 0) || !(annualPrice > 0)) return null;
  const percent = Math.round((1 - annualPrice / (weeklyPrice * 52)) * 100);
  return percent > 0 && percent < 100 ? percent : null;
}
