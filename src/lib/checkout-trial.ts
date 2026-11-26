// The free trial of a website (Stripe) subscription: 7 days, on the YEARLY
// plan only, and only on a person's first subscription.
//
// The owner's call, 2026-11-26: the free path leads to the plan that
// commits (whoever keeps it pays a full year at once), and the weekly plan
// pays from its first day. Until then the trial sat on the weekly plan.
//
// "First subscription": cancelling during a trial and subscribing again used
// to restart it, i.e. unlimited free weeks. The checkout route counts a
// subscription or a trial on file, from Stripe or from Google Play (a trial
// taken in the app is kept in `trial_end` too), as "not first".
//
// Google Play's trial is its own offer on the `annual` base plan
// (docs/play-billing.md), and Google decides who still gets it.
import type { PlanKey } from "./stripe";

export const TRIAL_DAYS = 7;

/** Days of free trial for a checkout of `plan`, or null for none. */
export function checkoutTrialDays(plan: PlanKey, firstSubscription: boolean): number | null {
  return plan === "annual" && firstSubscription ? TRIAL_DAYS : null;
}
