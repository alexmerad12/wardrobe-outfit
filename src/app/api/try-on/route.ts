import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import type { ClothingItem } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";
import { withGeminiRetry } from "@/lib/gemini-retry";

// Try-on / fitting-room endpoint runs on Gemini 3 Flash Preview via
// @google/genai with thinking disabled. Two AI calls: (1) analyze the
// candidate item photo, (2) propose 3 outfits pairing it with the
// existing wardrobe. Same model + setup as the analyze and suggest
// endpoints. GOOGLE_API_KEY must be set in env.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

// Shop-with-me / "fitting room" endpoint.
// User uploads a photo of an item they're considering buying; we analyze
// it, cross-reference with their existing wardrobe, and return:
//   - The item's inferred attributes (transient — NOT saved to DB)
//   - Similar items they already own (duplicate detection)
//   - 3 hypothetical outfits built from their wardrobe + this item
//     (versatility check)
// Everything runs in one request so the UX can show results in one screen.

const ANALYZE_SYSTEM_PROMPT = `You are a fashion expert analyzing a single clothing item photo. Return ONLY a JSON object — no preamble, no markdown fences, no explanation.

For each field, pick ONE of the allowed values below. Omit the field if genuinely indeterminate. Arrays may have 1-3 entries.

ENUMS:
- category: "top" | "bottom" | "dress" | "one-piece" | "outerwear" | "shoes" | "bag" | "accessory"
- subcategory: must match the category
- pattern (array): "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embellished" | "other"
- material (array): "cotton" | "denim" | "wool" | "silk" | "leather" | "knit" | "polyester" | "linen" | "canvas" | "cashmere" | "chiffon" | "corduroy" | "faux-fur" | "faux-leather" | "faux-suede" | "flannel" | "fleece" | "fur-shearling" | "jersey" | "lace" | "mesh" | "modal" | "nylon" | "patent-leather" | "rayon-viscose" | "rubber" | "satin" | "sheer" | "spandex" | "suede" | "tencel" | "tulle" | "tweed" | "twill" | "velvet" | "other"
- formality (array): "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal"
- seasons (array): "spring" | "summer" | "fall" | "winter"
- occasions (array): "work" | "casual" | "brunch" | "dinner-out" | "hangout" | "date" | "sport" | "outdoor" | "travel" | "party" | "formal" | "at-home"
- name: 2-5 word human label ("Black leather jacket")
- colors: array of { hex: "#rrggbb", name: "Title-case color name" } — up to 3 dominant colors
- warmth_rating: 1-5 in 0.5 steps
- is_layering_piece: true only for open cardigans, blazers, vests, open-drape pieces

Return one JSON object with category, subcategory, name, colors (required), plus any of the other fields you can infer confidently.`;

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

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Loose color match: name equality OR Euclidean RGB distance under a
// generous threshold. The AI generates fresh color names per photo
// ("Black" vs "Onyx" vs "Charcoal" for the same bag in different
// lighting), so name equality alone misses too many true duplicates.
// Hex closeness catches identical items photographed twice.
function colorsOverlap(
  a: { hex: string; name: string }[],
  b: { hex: string; name: string }[]
): boolean {
  const namesA = new Set(a.map((c) => c.name.toLowerCase().trim()));
  if (b.some((c) => namesA.has(c.name.toLowerCase().trim()))) return true;
  const rgbsA = a.map((c) => hexToRgb(c.hex)).filter(Boolean) as [number, number, number][];
  const rgbsB = b.map((c) => hexToRgb(c.hex)).filter(Boolean) as [number, number, number][];
  for (const ra of rgbsA) {
    for (const rb of rgbsB) {
      const d = Math.sqrt(
        (ra[0] - rb[0]) ** 2 + (ra[1] - rb[1]) ** 2 + (ra[2] - rb[2]) ** 2
      );
      if (d < 60) return true;
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    // Same downscale as the analyze endpoint — phone photos at 6MB
    // dominate vision-call latency. 1024px is plenty for clothing
    // classification.
    const buffer = await sharp(rawBuffer)
      .rotate()
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const base64 = buffer.toString("base64");
    const mediaType = "image/jpeg" as const;

    // 1. Analyze the photo — transient, not saved to DB.
    const analyzeRes = await withGeminiRetry(
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
      { tag: "try-on/analyze" }
    );

    const analyzeText = analyzeRes.text ?? "";
    const match = analyzeText.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "Couldn't read the photo — try a cleaner shot of the item." },
        { status: 502 }
      );
    }
    const rawAttrs = JSON.parse(match[0]);
    const attrs = sanitizeAutoFill(rawAttrs);

    if (!attrs.category) {
      return NextResponse.json(
        { error: "Couldn't identify the item category — try a clearer photo." },
        { status: 502 }
      );
    }

    // 2. Fetch wardrobe (only active items).
    const { data: wardrobeData } = await supabase
      .from("clothing_items")
      .select("*")
      .eq("is_stored", false);
    const wardrobe = (wardrobeData ?? []) as ClothingItem[];

    // 3. Similar items: subcategory match is required, then require
    // attribute matches from (pattern, color, material, neckline,
    // sleeve length). The threshold is category-aware: tops, dresses,
    // outerwear, one-piece have all five attributes available so we
    // require 2+ — one alone (e.g. shared "black" color) is too loose.
    // Bags, shoes, accessories, bottoms have no neckline/sleeve at
    // all, so 1+ match suffices to surface the duplicate. Color
    // matching is loose (name OR hex closeness) so the same physical
    // item photographed twice doesn't get missed because the AI named
    // its color differently.
    const phantomColors = (attrs.colors ?? []).map((c) => ({
      hex: c.hex,
      name: c.name,
    }));
    const phantomPatterns = Array.isArray(attrs.pattern)
      ? attrs.pattern
      : attrs.pattern
      ? [attrs.pattern]
      : [];
    const phantomMaterials = Array.isArray(attrs.material)
      ? attrs.material
      : attrs.material
      ? [attrs.material]
      : [];
    const phantomNeckline = attrs.neckline ?? null;
    const phantomSleeve = attrs.sleeve_length ?? null;
    const patternsOverlap = (a: string[], b: string[]): boolean => {
      if (a.length === 0 || b.length === 0) return false;
      const setA = new Set(a);
      return b.some((p) => setA.has(p));
    };
    const hasShapeAttrs = attrs.category === "top" ||
      attrs.category === "dress" ||
      attrs.category === "outerwear" ||
      attrs.category === "one-piece";
    const minScore = hasShapeAttrs ? 2 : 1;
    const similarItems = wardrobe
      .filter(
        (item) =>
          item.category === attrs.category &&
          !!attrs.subcategory &&
          item.subcategory === attrs.subcategory
      )
      .map((item) => {
        const itemPatterns = Array.isArray(item.pattern)
          ? item.pattern
          : [item.pattern];
        const itemMaterials = Array.isArray(item.material)
          ? item.material
          : item.material
          ? [item.material]
          : [];
        const patternMatch = patternsOverlap(phantomPatterns, itemPatterns) ? 1 : 0;
        const colorMatch = colorsOverlap(phantomColors, item.colors) ? 1 : 0;
        const materialMatch = patternsOverlap(phantomMaterials, itemMaterials) ? 1 : 0;
        const necklineMatch =
          phantomNeckline && item.neckline && phantomNeckline === item.neckline
            ? 1
            : 0;
        const sleeveMatch =
          phantomSleeve && item.sleeve_length && phantomSleeve === item.sleeve_length
            ? 1
            : 0;
        return {
          item,
          score: patternMatch + colorMatch + materialMatch + necklineMatch + sleeveMatch,
        };
      })
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.item);

    // 4. Outfit simulation — ask Claude for 3 outfits using the phantom item.
    // Only attempt when the wardrobe is complete enough to form outfits.
    let outfits: { item_ids: string[]; reason: string }[] = [];
    const phantomId = "phantom-item";
    if (wardrobe.length >= 3) {
      const phantomLine = `[${phantomId}] ${attrs.name ?? "new item"} (${attrs.category}${attrs.subcategory ? "/" + attrs.subcategory : ""}) | Colors: ${phantomColors.map((c) => c.name).join(", ")}${attrs.material ? " | Material: " + attrs.material.join(", ") : ""}${attrs.warmth_rating ? ` | Warmth: ${attrs.warmth_rating}/5` : ""}`;

      const wardrobeList = wardrobe.map((i) => describeItemForPrompt(i, i.id)).join("\n");

      const simRes = await withGeminiRetry(
        () =>
          genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are helping the user decide whether to buy a new piece. Build up to 3 complete outfits that show how the NEW item would pair with pieces already in the wardrobe. Use the new item as the anchor in every outfit.

Rules for each outfit:
- Include the NEW item (id "${phantomId}") in every outfit.
- Add 2-4 existing wardrobe items to complete the look. Use the [id] values verbatim from the wardrobe list.
- Must form a complete outfit: if the new item is a top/bottom, pair with opposite + shoes. If it's a dress / jumpsuit, add shoes + optional outerwear. If it's outerwear, pair with a full base (top+bottom or dress) + shoes.
- Never pair a dress or jumpsuit with another top or bottom.
- Skip the outfit entirely if you can't build a complete look around the new item.
- "reason": ONE short sentence in English explaining why this pairing works — refer to pieces by broad category only (the dress, the jacket, the shoes).

NEW ITEM (not in wardrobe yet):
${phantomLine}

EXISTING WARDROBE:
${wardrobeList}`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 1024,
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
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
        { tag: "try-on/sim" }
      );

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
      colors: phantomColors.map((c, i) => ({
        hex: c.hex,
        name: c.name,
        percentage: i === 0 ? 80 : 20,
      })),
      // Minimal required fields so orderOutfitItems works. We won't render
      // the phantom as a real card — the client has its own handling.
    } as unknown as ClothingItem;

    const resolvedOutfits = outfits.map((o) => {
      const items = o.item_ids
        .map((id) => {
          if (id === phantomId) return phantomPlaceholder;
          return wardrobe.find((w) => w.id === id);
        })
        .filter(Boolean) as ClothingItem[];
      return {
        items: orderOutfitItems(items),
        reason: o.reason,
      };
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
    return NextResponse.json(
      { error: "Failed to analyze the item" },
      { status: 500 }
    );
  }
}
