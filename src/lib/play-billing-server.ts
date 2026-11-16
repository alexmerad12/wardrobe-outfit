// Google Play subscriptions, the server part: reads a customer from
// RevenueCat with the SECRET key and writes the user_subscriptions row.
// Server-only: never import this from a "use client" file.
//
// Environment (docs/play-billing.md):
//   REVENUECAT_SECRET_KEY    a secret API key of the RevenueCat project
//   REVENUECAT_WEBHOOK_AUTH  the Authorization value RevenueCat sends with
//                            every webhook (set in its dashboard)
//   REVENUECAT_ENTITLEMENT   the entitlement that means "subscribed",
//                            "premium" when unset
import { timingSafeEqual, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mayOverwrite,
  playStateFromSubscriber,
  type PlayState,
  type RcSubscriber,
} from "./play-billing";
import { hasActiveAccess, type SubscriptionStatus } from "./subscription";

const API = "https://api.revenuecat.com/v1";
// Postgres foreign_key_violation: the user row is gone (account deleted).
const FK_VIOLATION = "23503";

export function playEntitlement(): string {
  return process.env.REVENUECAT_ENTITLEMENT?.trim() || "premium";
}

export function revenueCatConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_SECRET_KEY);
}

/** Compare two secrets without leaking where they differ. */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function revenueCat(path: string, init?: RequestInit): Promise<Response> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY is not set");
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // RevenueCat is the source of truth: never a cached answer.
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

/** The customer as RevenueCat knows it right now. */
export async function fetchSubscriber(userId: string): Promise<RcSubscriber> {
  const res = await revenueCat(`/subscribers/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`RevenueCat answered ${res.status} for a customer`);
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}

export async function fetchPlayState(userId: string): Promise<PlayState> {
  return playStateFromSubscriber(await fetchSubscriber(userId), playEntitlement(), Date.now());
}

/**
 * Bring one account's row in line with RevenueCat. Called by the webhook
 * (for every account an event names) and by the app right after a purchase
 * or a restore, so access does not wait for the webhook.
 *
 * Returns whether the account has access after the sync, from either
 * seller. Throws when RevenueCat or the database fails, so the webhook
 * answers 500 and RevenueCat retries.
 */
export async function syncPlaySubscription(
  admin: SupabaseClient,
  userId: string,
): Promise<{ active: boolean }> {
  const state = await fetchPlayState(userId);

  const { data: existing, error: readError } = await admin
    .from("user_subscriptions")
    .select("source, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(`subscription lookup failed: ${readError.message}`);
  const row = existing as { source: string | null; status: SubscriptionStatus } | null;

  if (state.kind === "none") {
    // Nothing at RevenueCat. If our row says Google Play still grants
    // access, the purchase left this account (moved to another one by a
    // restore, or removed): end it. A Stripe row is not ours to touch.
    if (row && row.source === "play" && hasActiveAccess(row)) {
      const { error } = await admin
        .from("user_subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false })
        .eq("user_id", userId)
        .eq("source", "play");
      if (error) throw new Error(`update failed: ${error.message}`);
      return { active: false };
    }
    return { active: hasActiveAccess(row) };
  }

  if (!mayOverwrite(row, { source: "play", active: state.active })) {
    // An active Stripe subscription owns the row; an ended Google Play
    // one changes nothing.
    return { active: hasActiveAccess(row) };
  }

  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      source: "play",
      store_product_id: state.storeProductId,
      plan: state.plan,
      status: state.status,
      current_period_end: state.periodEnd,
      cancel_at_period_end: state.endsInsteadOfRenewing,
      // Only ever SET: a trial once taken stays on file, which is what
      // refuses a second free week at Stripe's checkout.
      ...(state.status === "trialing" && state.periodEnd
        ? { trial_end: state.periodEnd }
        : {}),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    if (error.code === FK_VIOLATION) {
      console.warn("[play-billing] user no longer exists, skipping", userId);
      return { active: false };
    }
    throw new Error(`upsert failed: ${error.message}`);
  }
  return { active: state.active };
}

/**
 * Stop a Google Play subscription from renewing (it stays valid until its
 * end date, like a cancellation made in Google Play). Used before an
 * account is deleted: a deleted account must not keep being charged.
 *
 * "nothing": no Google Play subscription that could renew.
 * Throws when RevenueCat refuses, so the caller can stop.
 */
export async function cancelPlaySubscription(
  userId: string,
): Promise<"cancelled" | "nothing"> {
  const state = await fetchPlayState(userId);
  // Still renewing: active, or on hold after a failed payment (Google keeps
  // retrying the card for a while and would charge again if it worked).
  const couldRenew =
    state.kind === "subscription" &&
    !state.endsInsteadOfRenewing &&
    (state.active || state.status === "past_due");
  if (state.kind !== "subscription" || !couldRenew) return "nothing";
  if (!state.storeTransactionId) {
    throw new Error("RevenueCat gave no Google order id to cancel");
  }
  // Google numbers renewals "GPA.1234-...-56789..3": the subscription
  // itself is the id before the dots.
  const order = state.storeTransactionId.replace(/\.\.\d+$/, "");
  const res = await revenueCat(
    `/subscribers/${encodeURIComponent(userId)}/subscriptions/${encodeURIComponent(order)}/cancel`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`RevenueCat answered ${res.status} to the cancellation`);
  return "cancelled";
}

/** Remove the customer from RevenueCat once its account is deleted. Best
 *  effort: a leftover customer id means nothing without the account. */
export async function deleteRevenueCatCustomer(userId: string): Promise<void> {
  if (!revenueCatConfigured()) return;
  try {
    const res = await revenueCat(`/subscribers/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      console.warn("[play-billing] RevenueCat customer not deleted:", res.status);
    }
  } catch (err) {
    console.warn("[play-billing] RevenueCat customer not deleted:", err);
  }
}
