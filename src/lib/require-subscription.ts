// API-level subscription gate. The middleware blocks unsubscribed
// users from VIEWING paid pages; this helper blocks them from
// triggering paid AI calls via direct API hits. Used by suggest,
// suggest/refine, try-on, items/analyze, packing.
//
// Pattern:
//   const ctx = await requireUser();
//   if (isNextResponse(ctx)) return ctx;
//   const block = await requireActiveSubscription(ctx);
//   if (block) return block;
//
// Returns null on access, NextResponse(402) on block. Skips applied
// in order: admin/cap-bypass allowlist → grandfather cutoff (beta
// users) → active subscription row.
import { NextResponse } from "next/server";
import type { AuthedContext } from "./supabase/require-user";
import {
  getSubscription,
  hasActiveAccess,
  isGrandfathered,
} from "./subscription";
import { isCapBypassed } from "./admin-bypass";

export async function requireActiveSubscription(
  ctx: AuthedContext
): Promise<NextResponse | null> {
  if (isCapBypassed(ctx.userEmail)) return null;
  if (isGrandfathered(ctx.userCreatedAt)) return null;
  const sub = await getSubscription(ctx.supabase, ctx.userId);
  if (hasActiveAccess(sub)) return null;
  return NextResponse.json(
    { error: "subscription_required" },
    { status: 402 }
  );
}
