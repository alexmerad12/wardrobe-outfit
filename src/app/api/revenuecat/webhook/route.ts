// POST /api/revenuecat/webhook
// RevenueCat tells us that something happened to a Google Play
// subscription (bought, renewed, cancelled, expired, payment failed,
// moved to another account). The Android app's counterpart of
// /api/stripe/webhook.
//
// The event is only a signal. For every Linette account it names, the
// customer is re-read from RevenueCat and the row rewritten from that
// answer (syncPlaySubscription): events can arrive late, twice or out of
// order, and a rewrite from the current state is the same whatever the
// order. That is also why no event id is stored.
//
// RevenueCat authenticates itself with the Authorization value set in its
// dashboard (REVENUECAT_WEBHOOK_AUTH). Anything else gets 401 and changes
// nothing. A failure answers 500 so RevenueCat retries.
//
// The route is public in the proxy (PUBLIC_PATHS): RevenueCat has no
// session.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userIdsFromEvent, type RcEvent } from "@/lib/play-billing";
import {
  revenueCatConfigured,
  sameSecret,
  syncPlaySubscription,
} from "@/lib/play-billing-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || !revenueCatConfigured()) {
    console.error("[revenuecat-webhook] RevenueCat is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const given = request.headers.get("authorization") ?? "";
  if (!sameSecret(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { event?: RcEvent } | null;
  const event = body?.event;
  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "No event in the body" }, { status: 400 });
  }

  // The dashboard's test event and purchases made before the app knew who
  // was signed in name nobody of ours: acknowledged, nothing to do.
  const userIds = userIdsFromEvent(event);
  try {
    const admin = createAdminClient();
    for (const userId of userIds) {
      await syncPlaySubscription(admin, userId);
    }
    return NextResponse.json({ received: true, accounts: userIds.length });
  } catch (err) {
    console.error("[revenuecat-webhook] handler error:", String(event.type), err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
