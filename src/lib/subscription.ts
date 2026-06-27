// Subscription state helpers. Used by the middleware paywall gate
// and by any UI surface that needs to know whether the user has paid
// access. The webhook in /api/stripe/webhook is the only writer to
// user_subscriptions; everything else reads.
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export type PlanKey = "weekly" | "annual";

export type UserSubscription = {
  status: SubscriptionStatus;
  plan: PlanKey | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

// Statuses that grant paid access. past_due intentionally excluded —
// we re-prompt for payment instead of letting users keep using AI
// while Stripe retries the card.
const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active"];

// Paywall cutoff. Everyone whose auth user was created BEFORE this
// instant is grandfathered — they signed up under the free beta and
// keep unlimited free access forever. Don't change this date without
// thinking carefully; lowering it would start charging beta users,
// raising it would give free access to people who paid.
//
// 2026-06-12T00:00:00Z gives a small buffer past the paywall's first
// deploy (2026-06-11 evening) so anyone signing up the same day the
// gate ships isn't bounced mid-flow.
const PAYWALL_LIVE_AT_MS = Date.parse("2026-06-12T00:00:00Z");

export function isGrandfathered(
  userCreatedAt: string | null | undefined
): boolean {
  if (!userCreatedAt) return false;
  const ms = Date.parse(userCreatedAt);
  return Number.isFinite(ms) && ms < PAYWALL_LIVE_AT_MS;
}

export async function getSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSubscription | null> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select(
      "status, plan, trial_end, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data as UserSubscription | null) ?? null;
}

export function hasActiveAccess(
  sub: Pick<UserSubscription, "status"> | null | undefined
): boolean {
  if (!sub) return false;
  return ACTIVE_STATUSES.includes(sub.status);
}
