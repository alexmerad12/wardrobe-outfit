import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { Type } from "@google/genai";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { requireActiveSubscription } from "@/lib/require-subscription";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import type { ClothingItem } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";
import { withModelFallback, withParseRetry, parseJsonObject } from "@/lib/gemini-retry";
import { genAI, FAST_MODELS, QUALITY_MODELS, thinkingFor } from "@/lib/gemini";
import { colorFamily } from "@/lib/color-family";
import { buildAnalyzePrompt } from "@/lib/analyze-prompt";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";

// Two Gemini calls per use (about 2-3 cents), so 3/day caps worst case
// at roughly $2/mo per user. Tier presets to keep in mind:
//   - Conservative: 2/day
//   - Balanced:     3/day  ← current beta cap
//   - Generous:     5/day  ← future Atelier tier
// Tighter caps risk breaking a real store-run scenario (user pinging
// 5-8 items in one outing); 3/day is the floor where it still works
// for casual shopping. Beta matches the eventual Linette tier so the
// constraint reads as the real launch experience.
const TRY_ON_DAILY_CAP = 3;

// Vision read + wardrobe query + outfit call; well past the default on a
// slow upstream. 120 s (like suggest) since 2026-10-16: two Gemini calls
// plus the quality tier's fallback can outlast 60 s while Google is under
// load, and a function killed at the limit never refunds the daily cap.
export const maxDuration = 120;

// Shop-with-me / "fitting room" endpoint.
// User uploads a photo of an item they're considering buying; we analyze
// it, cross-reference with their existing wardrobe, and return:
//   - The item's inferred attributes (transient — NOT saved to DB)
//   - Similar items they already own (duplicate detection)
//   - 3 hypothetical outfits built from their wardrobe + this item
//     (versatility check)
// Everything runs in one request so the UX can show results in one screen.
// Models (src/lib/gemini.ts): the photo read is classification (fast
// tier), the outfit simulation is composition (quality tier).

function describeItemForPrompt(item: ClothingItem, idLabel: string): string {
  const parts: string[] = [`[${idLabel}]`, item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);
  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);
  if (item.fit) parts.push(`Fit: ${item.fit}`);
  const mats = Array.isArray(item.material) ? item.material : [item.material];
  if (mats.length) parts.push(`Material: ${mats.join(", ")}`);
  parts.push(`Warmth: ${item.warmth_rating}/5`);
  return parts.join(" | ");
}

// Color match via 12-family bucketing (brown / black / gray / red /
// blue / etc.). Raw RGB-distance was too loose — dark browns sit
// within ~50 RGB units of dark grays and near-blacks, so a brown
// turtleneck pulled in black and gray "matches". Family equality
// keeps "Crimson" ≈ "Burgundy" (both red) while cleanly rejecting
// brown ≠ gray.
function colorsOverlap(
  a: { hex: string; name: string }[],
  b: { hex: string; name: string }[]
): boolean {
  const familiesA = new Set(a.map((c) => colorFamily(c.hex)));
  return b.some((c) => familiesA.has(colorFamily(c.hex)));
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const subBlock = await requireActiveSubscription(ctx);
  if (subBlock) return subBlock;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  // Locale plumb-through (audit P2): this endpoint ignored locale
  // entirely — French users got English item names and outfit reasons.
  const locale: "en" | "fr" = formData?.get("locale") === "fr" ? "fr" : "en";
  const languageName = locale === "fr" ? "French" : "English";

  // Daily-cap gate. Same pattern as /api/suggest: consumed after the
  // free validation exits, refunded when the request delivers nothing,
  // admin/tester bypass like every other AI route.
  const isAdmin = isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed);
  const countKey = `tryon_count:${userId}:${localDayKey(request)}`;
  const capCount = await consumeDailyCap(countKey);
  if (!isAdmin && capCount > TRY_ON_DAILY_CAP) {
    return NextResponse.json(
      {
        error: "daily_limit_reached",
        limit: TRY_ON_DAILY_CAP,
        used: Math.min(capCount, TRY_ON_DAILY_CAP),
      },
      { status: 429 }
    );
  }
  // The user got nothing: give the use back and record the failure (three
  // unreadable photos used to lock the feature for the whole day).
  const fail = (message: string, status: number) => {
    if (capCount !== -1) refundDailyCap(countKey);
    logAiCall(supabase, userId, "try_on", { succeeded: false, metadata: { models: [FAST_MODELS[0], QUALITY_MODELS[0]] } });
    return NextResponse.json({ error: message }, { status });
  };

  try {
    // Same downscale as the analyze endpoint — phone photos at 6MB
    // dominate vision-call latency. 1024px is plenty for clothing
    // classification.
    const buffer = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" })
      .rotate()
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // 1. Analyze the photo — transient, not saved to DB. An unparseable
    // answer is asked again once (withParseRetry): a model glitch used to
    // tell the user to retake a photo that was fine.
    const {
      answer: { model: analyzeModel },
      parsed: rawAttrs,
    } = await withParseRetry(
      () =>
        withModelFallback(
          FAST_MODELS,
          (m) =>
            genAI.models.generateContent({
              model: m,
              contents: [
                {
                  role: "user",
                  parts: [
                    // Locale-aware variant of the analyze prompt so the
                    // transient item NAME comes back in the user's language.
                    { text: buildAnalyzePrompt(locale) },
                    { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } },
                    { text: "Analyze this garment and return the JSON object." },
                  ],
                },
              ],
              config: {
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
                thinkingConfig: thinkingFor(m, "none"),
              },
            }),
          { tag: "try-on/analyze" }
        ),
      ({ result }) => parseJsonObject<Record<string, unknown>>(result.text),
      { tag: "try-on/analyze" }
    );
    if (!rawAttrs) return fail("Couldn't read the photo — try a cleaner shot of the item.", 502);
    const attrs = sanitizeAutoFill(rawAttrs);
    if (!attrs.category) {
      return fail("Couldn't identify the item category — try a clearer photo.", 502);
    }

    // 2. Fetch wardrobe (only active items).
    const { data: wardrobeData } = await supabase
      .from("clothing_items")
      .select("*")
      .eq("is_stored", false);
    const wardrobe = (wardrobeData ?? []) as ClothingItem[];

    // 3. Similar items: subcategory match is required, then attribute
    // matches from (pattern, color, material, neckline, sleeve length).
    // For tops, dresses, outerwear, one-piece we REQUIRE color to be
    // one of the matches (plus at least one other) — without that,
    // every solid knit sweater scored 2 against any other solid knit
    // sweater regardless of color, so shopping for burgundy returned
    // black/gray/orange "duplicates". Bags, shoes, accessories,
    // bottoms have fewer matchable attrs so 1+ match suffices. Color
    // matching is loose (name OR hex closeness) so the same physical
    // item photographed twice doesn't get missed because the AI named
    // its color differently.
    const phantomColors = (attrs.colors ?? []).map((c) => ({ hex: c.hex, name: c.name }));
    const phantomPatterns = Array.isArray(attrs.pattern) ? attrs.pattern : attrs.pattern ? [attrs.pattern] : [];
    const phantomMaterials = Array.isArray(attrs.material) ? attrs.material : attrs.material ? [attrs.material] : [];
    const phantomNeckline = attrs.neckline ?? null;
    const phantomSleeve = attrs.sleeve_length ?? null;
    const patternsOverlap = (a: string[], b: string[]): boolean => {
      if (a.length === 0 || b.length === 0) return false;
      const setA = new Set(a);
      return b.some((p) => setA.has(p));
    };
    const hasShapeAttrs =
      attrs.category === "top" ||
      attrs.category === "dress" ||
      attrs.category === "outerwear" ||
      attrs.category === "one-piece";
    const similarItems = wardrobe
      .filter(
        (item) =>
          item.category === attrs.category &&
          !!attrs.subcategory &&
          item.subcategory === attrs.subcategory
      )
      .map((item) => {
        const itemPatterns = Array.isArray(item.pattern) ? item.pattern : [item.pattern];
        const itemMaterials = Array.isArray(item.material) ? item.material : item.material ? [item.material] : [];
        const patternMatch = patternsOverlap(phantomPatterns, itemPatterns) ? 1 : 0;
        const colorMatch = colorsOverlap(phantomColors, item.colors) ? 1 : 0;
        const materialMatch = patternsOverlap(phantomMaterials, itemMaterials) ? 1 : 0;
        const necklineMatch = phantomNeckline && item.neckline && phantomNeckline === item.neckline ? 1 : 0;
        const sleeveMatch = phantomSleeve && item.sleeve_length && phantomSleeve === item.sleeve_length ? 1 : 0;
        const otherMatches = patternMatch + materialMatch + necklineMatch + sleeveMatch;
        return { item, colorMatch, score: colorMatch + otherMatches };
      })
      .filter((x) => (hasShapeAttrs ? x.colorMatch === 1 && x.score >= 3 : x.colorMatch === 1))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.item);

    // 4. Outfit simulation — up to 3 outfits anchored on the new item.
    // Only attempt when the wardrobe is complete enough to form outfits.
    let outfits: { item_ids: string[]; reason: string }[] = [];
    let simModel: string | null = null; // the quality-tier model that answered
    const phantomId = "phantom-item";
    if (wardrobe.length >= 3) {
      const phantomLine = `[${phantomId}] ${attrs.name ?? "new item"} (${attrs.category}${attrs.subcategory ? "/" + attrs.subcategory : ""}) | Colors: ${phantomColors.map((c) => c.name).join(", ")}${attrs.material ? " | Material: " + attrs.material.join(", ") : ""}${attrs.warmth_rating ? ` | Warmth: ${attrs.warmth_rating}/5` : ""}`;
      const wardrobeList = wardrobe.map((i) => describeItemForPrompt(i, i.id)).join("\n");

      const sim = await withModelFallback(
        QUALITY_MODELS,
        (m) =>
          genAI.models.generateContent({
            model: m,
            contents: `You are helping the user decide whether to buy a new piece. Build up to 3 complete outfits that show how the NEW item would pair with pieces already in the wardrobe. Use the new item as the anchor in every outfit.

Rules for each outfit:
- Include the NEW item (id "${phantomId}") in every outfit.
- Add 2-4 existing wardrobe items to complete the look. Use the [id] values verbatim from the wardrobe list.
- Must form a complete outfit: if the new item is a top/bottom, pair with opposite + shoes. If it's a dress / jumpsuit, add shoes + optional outerwear. If it's outerwear, pair with a full base (top+bottom or dress) + shoes.
- Never pair a dress or jumpsuit with another top or bottom.
- Skip the outfit entirely if you can't build a complete look around the new item.
- "reason": ONE short sentence in ${languageName} explaining why this pairing works — refer to pieces by broad category only (the dress, the jacket, the shoes).

NEW ITEM (not in wardrobe yet):
${phantomLine}

EXISTING WARDROBE:
${wardrobeList}`,
            config: {
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  outfits: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                        reason: { type: Type.STRING },
                      },
                      required: ["item_ids", "reason"],
                    },
                  },
                },
                required: ["outfits"],
              },
              thinkingConfig: thinkingFor(m, "none"),
            },
          }),
        { tag: "try-on/sim" }
      );
      const simRes = sim.result;
      simModel = sim.model;

      try {
        const parsed = JSON.parse(simRes.text ?? "{}") as {
          outfits?: { item_ids: string[]; reason: string }[];
        };
        outfits = (parsed.outfits ?? []).filter(
          (o) => Array.isArray(o.item_ids) && o.item_ids.includes(phantomId)
        );
      } catch (err) {
        console.error("[try-on] Failed to parse outfit JSON:", err, (simRes.text ?? "").slice(0, 200));
      }
    }

    // 5. Resolve outfit item_ids: replace phantomId with the phantom attrs,
    // and look up real items. Reorder each outfit head-to-toe.
    const phantomPlaceholder = {
      id: phantomId,
      category: attrs.category,
      subcategory: attrs.subcategory ?? null,
      name: attrs.name ?? "new item",
      colors: phantomColors.map((c, i) => ({ hex: c.hex, name: c.name, percentage: i === 0 ? 80 : 20 })),
      // Minimal required fields so orderOutfitItems works. We won't render
      // the phantom as a real card — the client has its own handling.
    } as unknown as ClothingItem;

    const resolvedOutfits = outfits.map((o) => {
      const items = o.item_ids
        .map((id) => (id === phantomId ? phantomPlaceholder : wardrobe.find((w) => w.id === id)))
        .filter(Boolean) as ClothingItem[];
      return { items: orderOutfitItems(items), reason: o.reason };
    });

    logAiCall(supabase, userId, "try_on", {
      metadata: {
        category: attrs.category,
        similar_count: similarItems.length,
        outfit_count: resolvedOutfits.length,
        models: simModel ? [analyzeModel, simModel] : [analyzeModel],
      },
    });
    return NextResponse.json({
      item: {
        name: attrs.name ?? "New item",
        category: attrs.category,
        subcategory: attrs.subcategory ?? null,
        colors: phantomColors,
        material: attrs.material ?? [],
        warmth_rating: attrs.warmth_rating ?? null,
      },
      similarItems,
      outfits: resolvedOutfits,
      phantomId,
    });
  } catch (err) {
    console.error("Try-on error:", err);
    Sentry.captureException(err);
    return fail("Failed to analyze the item", 500);
  }
}
