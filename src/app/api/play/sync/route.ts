// POST /api/play/sync
// Called by the Android app right after a purchase or "Restore purchase":
// re-reads the caller's own customer from RevenueCat and writes the row,
// so access does not wait for the webhook (which can take a minute).
//
// Safe to call at any time: it only ever reads RevenueCat for the signed-in
// account, with the server's key, and the answer decides. Nothing the app
// sends is trusted (there is no body).
import { NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { revenueCatConfigured, syncPlaySubscription } from "@/lib/play-billing-server";

export const runtime = "nodejs";

export async function POST() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  if (!revenueCatConfigured()) {
    return NextResponse.json({ error: "play_billing_unavailable" }, { status: 503 });
  }

  try {
    const { active } = await syncPlaySubscription(createAdminClient(), ctx.userId);
    return NextResponse.json({ active });
  } catch (err) {
    console.error("[play/sync] failed:", err);
    return NextResponse.json({ error: "Could not check the purchase" }, { status: 502 });
  }
}
