import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { ANALYZE_SYSTEM_PROMPT } from "@/lib/analyze-prompt";

// Item analysis runs on Gemini 3 Flash Preview via @google/genai with
// thinking disabled. The existing sanitizeAutoFill handles enum
// validation, so we don't need a strict responseSchema.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });


export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  try {
    // Accept EITHER multipart (legacy single-add path) OR JSON
    // {sourceUrl} (bulk pipeline + anything that already uploaded
    // to Supabase). The URL path bypasses Vercel's 4.5 MB body limit
    // — the bulk pipeline uses it because phone photos blow that
    // limit even after client-side downscale.
    const ct = request.headers.get("content-type") ?? "";
    let rawBuffer: Buffer;
    if (ct.includes("application/json")) {
      const body = (await request.json()) as { sourceUrl?: string };
      if (!body.sourceUrl) {
        return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
      }
      const fetchRes = await fetch(body.sourceUrl);
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
      rawBuffer = Buffer.from(await file.arrayBuffer());
    }
    // Downsize before sending — Gemini's image-token cost scales with
    // resolution and a 6MB phone photo took ~25s end-to-end while the
    // same image at 1024px wide took ~1.5s. 1024px is plenty of detail
    // for clothing classification (silhouette, color, pattern, fit).
    // Convert to JPEG so we always send Gemini a known-good format.
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
                { text: ANALYZE_SYSTEM_PROMPT },
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
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    const parsed = JSON.parse(match[0]);
    // Drop anything that isn't on the enum allowlist. The model occasionally
    // returns close-but-invalid values ("t_shirt" for "t-shirt", "blue"
    // in the material field) — keeping those would make the Supabase
    // insert fail with a check-constraint violation.
    return NextResponse.json(sanitizeAutoFill(parsed));
  } catch (err) {
    console.error("[analyze] Item analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
