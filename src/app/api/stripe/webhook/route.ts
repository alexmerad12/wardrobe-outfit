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
// Every handled event re-reads the subscription from Stripe instead of
// trusting the payload: Stripe can deliver (and retry) events out of
// order, and writing a stale "trialing" payload after a "deleted" one used
// to hand a cancelled user free access again.
//
// A failed DB write returns 500 so Stripe retries (it used to be logged
// and acknowledged, leaving a paying user stuck on /paywall). The one
// exception is an event for an account that no longer exists (deleted via
// /api/account/delete): acknowledged, nothing to update.
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

// Postgres foreign_key_violation: the user row is gone (account deleted).
const FK_VIOLATION = "23503";

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
): Promise<void> {
  const admin = createAdminClient();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Map back to our user. Prefer the user_id stamped on the subscription
  // at checkout; fall back to the session's client_reference_id, then to
  // a stripe_customer_id lookup.
  let userId =
    (subscription.metadata?.user_id as string | undefined) ??
    fallbackUserId ??
    null;
  if (!userId) {
    const { data, error } = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`customer lookup failed: ${error.message}`);
    userId = (data?.user_id as string | undefined) ?? null;
  }
  if (!userId) {
    // Nothing we can attach this to (e.g. a subscription made outside the
    // app). Retrying won't change that, so acknowledge.
    console.error("[stripe-webhook] no user for subscription", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: planFromPriceId(priceId),
      status: subscription.status,
      trial_end: isoOrNull(subscription.trial_end),
      current_period_end: isoOrNull(
        // Newer API versions put current_period_end on the subscription
        // item; fall back to top-level for older payload shapes.
        subscription.items.data[0]?.current_period_end ??
          (subscription as unknown as { current_period_end?: number })
            .current_period_end
      ),
      // Stripe expresses "won't renew" two ways: cancel_at_period_end
      // (flag) for active subs cancelled via most paths, and cancel_at
      // (timestamp) for trialing subs cancelled via the Customer
      // Portal. Treat either as "ends instead of renews".
      cancel_at_period_end:
        subscription.cancel_at_period_end || subscription.cancel_at != null,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    if (error.code === FK_VIOLATION) {
      console.warn("[stripe-webhook] user no longer exists, skipping", userId);
      return;
    }
    throw new Error(`upsert failed: ${error.message}`);
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
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertFromSubscription(
          subscription,
          session.client_reference_id ?? undefined
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const fromEvent = event.data.object as Stripe.Subscription;
        // Current state, not the (possibly stale) state in this event.
        const subscription = await stripe.subscriptions.retrieve(fromEvent.id);
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
