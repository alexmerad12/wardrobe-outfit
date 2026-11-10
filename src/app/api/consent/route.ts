import { NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { dbErrorResponse } from "@/lib/db-error";
import { hasConsented } from "@/lib/consent";

// Records the one-time consent from /consent: 18 or older, and photos and
// wardrobe details may go to Google Gemini (src/lib/consent.ts). Both
// answers are required together, and the first answer's time is kept: a
// second call changes nothing. /api/preferences cannot write these columns.
export async function POST(request: Request) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  const body = await readJsonObject(request);
  if (isNextResponse(body)) return body;
  if (body.adult !== true || body.ai !== true) {
    return NextResponse.json({ error: "both_answers_required" }, { status: 400 });
  }

  const { data: prefs, error: readError } = await ctx.supabase
    .from("user_preferences")
    .select("age_confirmed_at, ai_consent_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (readError) return dbErrorResponse(readError);
  // No preferences row yet: onboarding creates it, and comes first.
  if (!prefs) {
    return NextResponse.json({ error: "onboarding_required" }, { status: 409 });
  }
  if (hasConsented(prefs)) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("user_preferences")
    .update({
      age_confirmed_at: prefs.age_confirmed_at ?? now,
      ai_consent_at: prefs.ai_consent_at ?? now,
    })
    .eq("user_id", ctx.userId);
  if (error) return dbErrorResponse(error);
  return NextResponse.json({ ok: true });
}
