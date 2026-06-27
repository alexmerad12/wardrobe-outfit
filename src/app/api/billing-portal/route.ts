// POST /api/billing-portal
// Opens a Stripe Customer Portal session for the current user so
// they can update payment method, change plan, view invoices, or
// cancel. Stripe hosts the entire portal UI; we just hand them a
// short-lived URL and the user comes back to our return_url after.
//
// Customer ID comes from user_subscriptions — only users who've
// completed at least one checkout have a row, so this 404s for
// users who never paid (they should be on /paywall anyway).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { stripe } from "@/lib/stripe";
import { getSubscription } from "@/lib/subscription";

function siteOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const sub = await getSubscription(supabase, userId);
  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No active subscription to manage" },
      { status: 404 }
    );
  }

  const origin = siteOrigin(request);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/profile/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal] Stripe error:", err);
    return NextResponse.json(
      { error: "Couldn't open billing portal" },
      { status: 500 }
    );
  }
}
