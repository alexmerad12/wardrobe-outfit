// API-level consent gate, beside require-subscription.ts. The proxy sends
// an account that hasn't answered /consent to that screen before any app
// page; this stops a direct call (or a tab left open) from sending photos
// or wardrobe details to Gemini first. Used by the five routes that call
// Gemini: suggest, suggest/refine, try-on, items/analyze, packing.
//
//   const consentBlock = await requireAiConsent(ctx);
//   if (consentBlock) return consentBlock;
//
// Returns null when both answers are on file, 403 when they are not, and
// 503 when the read failed: no proof of consent, nothing goes to Gemini.
import { NextResponse } from "next/server";
import type { AuthedContext } from "./supabase/require-user";
import { hasConsented } from "./consent";

export async function requireAiConsent(ctx: AuthedContext): Promise<NextResponse | null> {
  const { data, error } = await ctx.supabase
    .from("user_preferences")
    .select("age_confirmed_at, ai_consent_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "consent_check_failed" }, { status: 503 });
  }
  if (hasConsented(data)) return null;
  return NextResponse.json({ error: "ai_consent_required" }, { status: 403 });
}
