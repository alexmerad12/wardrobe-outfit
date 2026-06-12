import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzePrompt } from "@/lib/analyze-prompt";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap } from "@/lib/daily-cap";

// Item analysis runs on Gemini 3 Flash Preview via @google/genai with
// thinking disabled. The existing sanitizeAutoFill handles enum
// validation, so we don't need a strict responseSchema.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

// Image fetch + sharp + Gemini comfortably exceeds the platform default
// on slow upstreams; normalize sets the same. (Audit C4/C6.)
export const maxDuration = 60;

// This was the only Gemini endpoint with NO daily cap (audit C4) —
// a runaway client could loop vision calls unmetered. Balanced band:
// bulk uploads run 10 photos per batch, so 40 ≈ four batches/day.
//   - Conservative: 20/day
//   - Balanced:     40/day  ← current beta cap
//   - Generous:     80/day
const ANALYZE_DAILY_CAP = 40;

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const { data: { user: authUser } } = await supabase.auth.getUser();
  const isAdmin = isCapBypassed(authUser?.email);
  const today = new Date().toISOString().slice(0, 10);
  const countKey = `analyze_count:${userId}:${today}`;
  let capCount: number | null = null;

  try {
    // Accept EITHER multipart (legacy single-add path) OR JSON
    // {sourceUrl} (bulk pipeline + anything that already uploaded
    // to Supabase). The URL path bypasses Vercel's 4.5 MB body limit
    // — the bulk pipeline uses it because phone photos blow that
    // limit even after client-side downscale.
    const ct = request.headers.get("content-type") ?? "";
    let rawBuffer: Buffer;
    let locale: "en" | "fr" = "en";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as { sourceUrl?: string; locale?: string };
      if (!body.sourceUrl) {
        return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
      }
      if (body.locale === "fr") locale = "fr";
      // 15s ceiling — a stalled upstream used to hang the function
      // until the platform killed it (audit C6).
      const fetchRes = await fetch(body.sourceUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!fetchRes.ok) {
        return NextResponse.json(
          { error: `Couldn't fetch source: ${fetchRes.status}` },
          { status: 502 }
        );
      }
      rawBuffer = Buffer.from(await fetchRes.arrayBuffer());
    } else {
      const formData = await request.formData();
      const file = formData.get("image");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "Missing image" }, { status: 400 });
      }
      const localeField = formData.get("locale");
      if (typeof localeField === "string" && localeField === "fr") locale = "fr";
      rawBuffer = Buffer.from(await file.arrayBuffer());
    }
    // Downsize before sending — Gemini's image-token cost scales with
    // resolution and a 6MB phone photo took ~25s end-to-end while the
    // same image at 1024px wide took ~1.5s. 1024px is plenty of detail
    // for clothing classification (silhouette, color, pattern, fit).
    // Convert to JPEG so we always send Gemini a known-good format.
    capCount = await consumeDailyCap(countKey);
    if (!isAdmin && capCount > ANALYZE_DAILY_CAP) {
      return NextResponse.json(
        {
          error: "daily_limit_reached",
          limit: ANALYZE_DAILY_CAP,
          used: Math.min(capCount, ANALYZE_DAILY_CAP),
        },
        { status: 429 }
      );
    }

    const buffer = await sharp(rawBuffer)
      .rotate() // honor EXIF orientation
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const base64 = buffer.toString("base64");
    const mediaType = "image/jpeg" as const;

    const result = await withGeminiRetry(
      () =>
        genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: buildAnalyzePrompt(locale) },
                { inlineData: { mimeType: mediaType, data: base64 } },
                { text: "Analyze this garment and return the JSON object." },
              ],
            },
          ],
          config: {
            temperature: 0.5,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      { tag: "analyze" }
    );

    const text = result.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[analyze] Failed to parse Gemini response:", text.slice(0, 200));
      if (capCount !== null && capCount !== -1) refundDailyCap(countKey);
      logAiCall(supabase, userId, "analyze_item", { succeeded: false });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    const parsed = JSON.parse(match[0]);
    // Drop anything that isn't on the enum allowlist. The model occasionally
    // returns close-but-invalid values ("t_shirt" for "t-shirt", "blue"
    // in the material field) — keeping those would make the Supabase
    // insert fail with a check-constraint violation.
    const sanitized = sanitizeAutoFill(parsed);
    logAiCall(supabase, userId, "analyze_item", {
      metadata: { category: sanitized.category ?? null },
    });
    return NextResponse.json(sanitized);
  } catch (err) {
    console.error("[analyze] Item analyze error:", err);
    Sentry.captureException(err);
    if (capCount !== null && capCount !== -1) refundDailyCap(countKey);
    logAiCall(supabase, userId, "analyze_item", { succeeded: false });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
