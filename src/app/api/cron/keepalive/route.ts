import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily keep-alive (vercel.json "crons"). The Supabase project runs on the
// FREE plan, which auto-pauses after 7 days without activity: the whole
// app was found down on 2026-10-09 and restored on 2026-10-15. One tiny
// read through the REST API each day counts as activity.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is
// refused. The path is in the middleware PUBLIC_PATHS (no user session).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_preferences")
    .select("user_id", { count: "exact", head: true });
  if (error) {
    console.error("[keepalive] Supabase ping failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, accounts: count });
}
