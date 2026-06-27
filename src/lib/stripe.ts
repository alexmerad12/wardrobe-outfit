// Server-only Stripe client. Don't import this from any "use client"
// component — the secret key would leak into the browser bundle.
//
// API version is pinned by the installed SDK (currently v22.x). If
// we upgrade the stripe package, re-test the webhook handler since
// the event payload shapes occasionally shift between API versions.
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export type PlanKey = "weekly" | "annual";

export function priceIdForPlan(plan: PlanKey): string {
  const id =
    plan === "weekly"
      ? process.env.STRIPE_PRICE_WEEKLY
      : process.env.STRIPE_PRICE_ANNUAL;
  if (!id || id.startsWith("price_REPLACE_ME")) {
    throw new Error(
      `Stripe price ID for plan "${plan}" is not configured. ` +
        `Set STRIPE_PRICE_WEEKLY and STRIPE_PRICE_ANNUAL in .env.local.`
    );
  }
  return id;
}
