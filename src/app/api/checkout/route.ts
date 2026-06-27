// POST /api/checkout
// Creates a Stripe Checkout Session for one of the two plans and
// returns the redirect URL. The client redirects the user to
// Stripe-hosted checkout; on completion Stripe redirects back to
// /paywall/success and fires the checkout.session.completed webhook
// (which is the source of truth for the user_subscriptions row).
//
// The 7-day trial is attached to the weekly plan via
// subscription_data.trial_period_days. payment_method_collection is
// forced to "always" because the default ("if_required") skips card
// capture on trials — and the whole point of this structure is that
// the card is on file so the trial auto-converts.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { stripe, priceIdForPlan, type PlanKey } from "@/lib/stripe";
import { getSubscription } from "@/lib/subscription";

function siteOrigin(req: NextRequest): string {
  // Vercel + local both honor x-forwarded-host; fall back to the
  // request URL origin if it's missing.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== "weekly" && plan !== "annual") {
    return NextResponse.json(
      { error: "plan must be 'weekly' or 'annual'" },
      { status: 400 }
    );
  }
  const planKey: PlanKey = plan;

  // Reuse an existing Stripe customer if one was created in a prior
  // checkout attempt. Otherwise let Stripe create one from email.
  const existing = await getSubscription(supabase, userId);
  const customerId = existing?.stripe_customer_id ?? undefined;

  // Pull the user's email from Supabase auth — Stripe needs it for
  // customer creation and for receipts.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? undefined;

  const origin = siteOrigin(request);
  const priceId = priceIdForPlan(planKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // 7-day trial only on the weekly plan; annual is no-trial.
      subscription_data:
        planKey === "weekly"
          ? {
              trial_period_days: 7,
              metadata: { user_id: userId, plan: planKey },
            }
          : { metadata: { user_id: userId, plan: planKey } },
      // Force card capture on trials so the trial auto-converts to
      // paid without the user re-entering payment info.
      payment_method_collection: "always",
      // Mapping back to our user. client_reference_id is the primary
      // signal in the checkout.session.completed webhook.
      client_reference_id: userId,
      // Subscription mode auto-creates a Stripe customer — don't pass
      // customer_creation (payment-mode only) or customer_update.
      // Reuse the customer if we already created one in a prior
      // checkout attempt; otherwise let Stripe create one and seed
      // the email so the user doesn't retype it.
      ...(customerId
        ? { customer: customerId }
        : email
        ? { customer_email: email }
        : {}),
      allow_promotion_codes: true,
      success_url: `${origin}/paywall/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/paywall`,
      metadata: {
        user_id: userId,
        plan: planKey,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe didn't return a checkout URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe error:", err);
    return NextResponse.json(
      { error: "Couldn't open checkout. Please try again." },
      { status: 500 }
    );
  }
}
