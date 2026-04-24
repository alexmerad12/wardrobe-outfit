import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import type { ClothingItem } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";

const anthropic = new Anthropic();

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
- pattern (array): "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embroidery" | "other"
- material (array): "cotton" | "denim" | "wool" | "silk" | "leather" | "knit" | "polyester" | "linen" | "canvas" | "cashmere" | "chiffon" | "corduroy" | "faux-fur" | "faux-leather" | "faux-suede" | "flannel" | "fleece" | "fur-shearling" | "jersey" | "lace" | "mesh" | "modal" | "nylon" | "patent-leather" | "rayon-viscose" | "rubber" | "satin" | "sheer" | "spandex" | "suede" | "tencel" | "tulle" | "tweed" | "twill" | "velvet" | "other"
- formality (array): "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal"
- seasons (array): "spring" | "summer" | "fall" | "winter"
- occasions (array): "work" | "casual" | "brunch" | "dinner-out" | "hangout" | "date" | "sport" | "outdoor" | "travel" | "party" | "formal" | "at-home"
- name: 2-5 word human label ("Black leather jacket")
- colors: array of { hex: "#rrggbb", name: "Title-case color name" } — up to 3 dominant colors
- warmth_rating: 1-5 in 0.5 steps
- rain_appropriate: boolean
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

function colorsOverlap(a: { name: string }[], b: { name: string }[]): boolean {
  const setA = new Set(a.map((c) => c.name.toLowerCase().trim()));
  return b.some((c) => setA.has(c.name.toLowerCase().trim()));
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "image/webp" ||
      file.type === "image/gif"
        ? file.type
        : "image/jpeg";

    // 1. Analyze the photo — transient, not saved to DB.
    const analyzeMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: ANALYZE_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Analyze this garment and return the JSON object.",
            },
          ],
        },
      ],
    });

    const analyzeText = analyzeMsg.content[0].type === "text" ? analyzeMsg.content[0].text : "";
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

    // 3. Similar items: same category; rank by color overlap + subcategory match.
    const phantomColors = (attrs.colors ?? []).map((c) => ({
      hex: c.hex,
      name: c.name,
    }));
    const similarItems = wardrobe
      .filter((item) => item.category === attrs.category)
      .map((item) => {
        const subMatch =
          attrs.subcategory && item.subcategory === attrs.subcategory ? 1 : 0;
        const colorMatch = colorsOverlap(phantomColors, item.colors) ? 1 : 0;
        return { item, score: subMatch * 2 + colorMatch };
      })
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

      const simMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        temperature: 0.7,
        tools: [
          {
            name: "propose_outfits_with_phantom",
            description:
              "Return up to 3 outfit combinations that include the NEW item plus pieces from the user's existing wardrobe.",
            input_schema: {
              type: "object" as const,
              properties: {
                outfits: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      item_ids: {
                        type: "array",
                        items: { type: "string" },
                      },
                      reason: { type: "string" },
                    },
                    required: ["item_ids", "reason"],
                  },
                },
              },
              required: ["outfits"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "propose_outfits_with_phantom" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are helping the user decide whether to buy a new piece. Build up to 3 complete outfits that show how the NEW item would pair with pieces already in the wardrobe. Use the new item as the anchor in every outfit.

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
              },
            ],
          },
        ],
      });

      const toolUse = simMsg.content.find((c) => c.type === "tool_use");
      if (toolUse && toolUse.type === "tool_use") {
        const parsed = toolUse.input as {
          outfits?: { item_ids: string[]; reason: string }[];
        };
        outfits = (parsed.outfits ?? []).filter(
          (o) => Array.isArray(o.item_ids) && o.item_ids.includes(phantomId)
        );
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
