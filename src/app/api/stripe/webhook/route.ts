// POST /api/stripe/webhook
// Stripe's source-of-truth → our database. Only place that writes
// to user_subscriptions.
//
// Events handled:
//   checkout.session.completed     → upsert row with stripe IDs + plan
//   customer.subscription.updated  → sync status, period end, cancel flag
//   customer.subscription.deleted  → mark canceled
//   invoice.payment_failed         → noop (subscription.updated will set past_due)
//
// Signature verification uses STRIPE_WEBHOOK_SECRET. If that env var
// is unset or wrong, every request 400s — which is the right failure
// mode since an unverified webhook should never mutate our DB.
//
// CRITICAL: the route must read the raw request body for signature
// verification. Don't use request.json() — it consumes and re-parses
// the body, breaking the HMAC check. Use request.text() instead.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanKey } from "@/lib/subscription";

export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function planFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_WEEKLY) return "weekly";
  if (priceId === process.env.STRIPE_PRICE_ANNUAL) return "annual";
  return null;
}

async function upsertFromSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string
) {
  const admin = createAdminClient();

  // Map back to our user. Prefer client_reference_id captured during
  // checkout (passed in via subscription metadata when we created the
  // session); fall back to a stripe_customer_id lookup for ongoing
  // events (renewal, cancel, etc.) where the metadata was set on the
  // earlier checkout session.
  let userId =
    (subscription.metadata?.user_id as string | undefined) ??
    fallbackUserId ??
    null;

  if (!userId) {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const { data } = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
  }

  if (!userId) {
    console.error(
      "[stripe-webhook] Could not resolve userId for subscription",
      subscription.id
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = planFromPriceId(priceId);

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan,
      status: subscription.status,
      trial_end: isoOrNull(subscription.trial_end),
      current_period_end: isoOrNull(
        // Stripe API exposes current_period_end on the subscription
        // item in newer API versions; fall back to top-level for
        // older payload shapes.
        subscription.items.data[0]?.current_period_end ??
          (subscription as unknown as { current_period_end?: number })
            .current_period_end
      ),
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[stripe-webhook] upsert failed:", error.message);
  }
}

export async function POST(request: NextRequest) {
  if (!webhookSecret || webhookSecret.startsWith("whsec_REPLACE_ME")) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json(
      { error: `Signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );
        await upsertFromSubscription(
          subscription,
          session.client_reference_id ?? undefined
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(subscription);
        break;
      }
      default:
        // Ignored events still return 200 — Stripe retries non-2xx
        // and we don't want to retry a no-op.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
