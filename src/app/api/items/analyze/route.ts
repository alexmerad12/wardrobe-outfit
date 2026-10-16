import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { requireActiveSubscription } from "@/lib/require-subscription";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import { withModelFallback } from "@/lib/gemini-retry";
import { genAI, FAST_MODELS, thinkingFor } from "@/lib/gemini";
import { buildAnalyzePrompt } from "@/lib/analyze-prompt";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";
import { downloadOwnedPhoto, ownedPhotoPath } from "@/lib/owned-photo";

// Item analysis: one vision call on the fast tier (FAST_MODELS in
// src/lib/gemini.ts: Flash-Lite, the quality model when it is down).
// sanitizeAutoFill does the enum validation, so no strict responseSchema.

// Image read + sharp + Gemini comfortably exceeds the platform default
// on slow upstreams; normalize sets more. (Audit C4/C6.) 120 s since
// 2026-10-16: with Google under load, 3 of 6 analyze calls on a Vercel
// preview ran past 60 s and died as 504s (blank tags in the bulk flow,
// which waits on the ~24 s cutout anyway); the same photos answered in
// 27-31 s locally. A function killed at the limit never refunds the cap.
export const maxDuration = 120;

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
  const subBlock = await requireActiveSubscription(ctx);
  if (subBlock) return subBlock;

  const isAdmin = isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed);
  const countKey = `analyze_count:${userId}:${localDayKey(request)}`;

  // Accept EITHER multipart (single-add path, the photo itself) OR JSON
  // with the storage path of an upload (bulk pipeline: phone photos blow
  // Vercel's 4.5 MB body limit, so they go to Supabase first).
  let rawBuffer: Buffer;
  let locale: "en" | "fr" = "en";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | { sourcePath?: unknown; sourceUrl?: unknown; locale?: unknown }
        | null;
      if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
      if (body.locale === "fr") locale = "fr";
      const path = ownedPhotoPath(userId, body);
      if (!path) return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
      const photo = await downloadOwnedPhoto(supabase, path);
      if ("error" in photo) {
        return NextResponse.json({ error: photo.error }, { status: photo.status });
      }
      rawBuffer = photo.buffer;
    } else {
      const formData = await request.formData().catch(() => null);
      const file = formData?.get("image");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "Missing image" }, { status: 400 });
      }
      if (formData?.get("locale") === "fr") locale = "fr";
      rawBuffer = Buffer.from(await file.arrayBuffer());
    }
  } catch (err) {
    console.error("[analyze] reading the photo failed:", err);
    return NextResponse.json({ error: "Couldn't read the photo" }, { status: 400 });
  }

  const capCount = await consumeDailyCap(countKey);
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
  const refund = () => {
    if (capCount !== -1) refundDailyCap(countKey);
  };

  try {
    // Downsize before sending: Gemini's image-token cost scales with
    // resolution, and 1024 px is plenty for clothing classification.
    // JPEG so Gemini always gets a known-good format.
    const buffer = await sharp(rawBuffer, { failOn: "none" })
      .rotate() // honor EXIF orientation
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const { result, model } = await withModelFallback(
      FAST_MODELS,
      (m) =>
        genAI.models.generateContent({
          model: m,
          contents: [
            {
              role: "user",
              parts: [
                { text: buildAnalyzePrompt(locale) },
                { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } },
                { text: "Analyze this garment and return the JSON object." },
              ],
            },
          ],
          config: {
            // Headroom: any thinking tokens count against this cap.
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            thinkingConfig: thinkingFor(m, "none"),
          },
        }),
      { tag: "analyze" }
    );

    const text = result.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[analyze] Failed to parse Gemini response:", text.slice(0, 200));
      refund();
      logAiCall(supabase, userId, "analyze_item", { succeeded: false, metadata: { model } });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    // Drop anything that isn't on the enum allowlist. The model occasionally
    // returns close-but-invalid values ("t_shirt" for "t-shirt", "blue"
    // in the material field) — keeping those would make the Supabase
    // insert fail with a check-constraint violation.
    const sanitized = sanitizeAutoFill(JSON.parse(match[0]));
    logAiCall(supabase, userId, "analyze_item", {
      metadata: { category: sanitized.category ?? null, model },
    });
    return NextResponse.json(sanitized);
  } catch (err) {
    console.error("[analyze] Item analyze error:", err);
    Sentry.captureException(err);
    refund();
    logAiCall(supabase, userId, "analyze_item", { succeeded: false, metadata: { models: FAST_MODELS } });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
