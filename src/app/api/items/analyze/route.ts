import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";

const anthropic = new Anthropic();

// Static instructions + full enum list. Cached across requests so each call
// only pays for the (unique) image tokens + the ~200-token JSON output.
const SYSTEM_PROMPT = `You are a fashion expert analyzing a single clothing item photo. Return ONLY a JSON object — no preamble, no markdown fences, no explanation.

For each field, pick ONE of the allowed values below. Omit the field if genuinely indeterminate. Arrays may have 1-3 entries.

ENUMS:
- category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "accessory"
- subcategory (must match the category):
  • top: "t-shirt" | "blouse" | "shirt" | "tank-top" | "crop-top" | "sweater" | "hoodie" | "cardigan"
  • bottom: "jeans" | "trousers" | "shorts" | "skirt" | "leggings" | "sweatpants"
  • dress: "mini-dress" | "midi-dress" | "maxi-dress" | "jumpsuit"
  • outerwear: "jacket" | "coat" | "blazer" | "vest" | "windbreaker" | "puffer" | "bomber" | "denim-jacket" | "leather-jacket" | "trench-coat" | "peacoat" | "parka"
  • shoes: "sneakers" | "boots" | "combat-boots" | "western-boots" | "chelsea-boots" | "ankle-boots" | "knee-boots" | "heels" | "sandals" | "flats" | "ballet-flats" | "loafers" | "mules" | "espadrilles"
  • bag: "handbag" | "backpack" | "tote" | "clutch" | "crossbody"
  • accessory: "belt" | "scarf" | "hat" | "jewelry" | "sunglasses" | "watch"
- pattern (array): "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embroidery" | "other"
- material (array): "cotton" | "denim" | "wool" | "silk" | "polyester" | "leather" | "faux-leather" | "suede" | "faux-suede" | "patent-leather" | "linen" | "knit" | "satin" | "velvet" | "corduroy" | "canvas" | "mesh" | "sheer" | "lace" | "tulle" | "chiffon" | "fur-shearling" | "faux-fur" | "rubber" | "nylon" | "other"
- formality (array): "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal"
- seasons (array): "spring" | "summer" | "fall" | "winter"
- occasions (array): "work" | "casual" | "brunch" | "dinner-out" | "hangout" | "date" | "sport" | "outdoor" | "travel" | "party" | "formal" | "at-home"
- fit: "slim" | "regular" | "loose" | "oversized"
- bottom_fit (bottoms only): "skinny" | "slim" | "straight" | "regular" | "wide-leg" | "flared" | "bootcut" | "tapered"
- length (tops/outerwear only): "cropped" | "regular" | "long" | "extra-long"
- pants_length (bottoms only): "capri" | "ankle-crop" | "ankle" | "full" | "extra-long"
- waist_style: "elastic" | "fitted" | "relaxed" | "belted"
- waist_height (bottoms only): "high" | "mid" | "low"
- waist_closure (bottoms only): "button-zip" | "elastic" | "drawstring" | "tie" | "hook-eye" | "pull-on" | "side-zip" | "other"
- neckline (tops/dresses/outerwear): "crew" | "v-neck" | "scoop" | "square" | "boat" | "turtleneck" | "mock-neck" | "halter" | "one-shoulder" | "off-shoulder" | "collared" | "henley" | "cowl" | "sweetheart" | "other"
- sleeve_length (tops/dresses/outerwear): "strapless" | "spaghetti" | "thin-strap" | "wide-strap" | "sleeveless" | "cap" | "short" | "elbow" | "three-quarter" | "long" | "other"
- closure (tops/dresses/outerwear): "pullover" | "full-button" | "partial-button" | "zipper" | "wrap-tie" | "snap" | "hook-eye" | "open-drape" | "other"
- shoe_height (shoes only): "low" | "ankle" | "mid" | "knee" | "over-knee"
- heel_type (shoes only): "flat" | "low-heel" | "mid-heel" | "high-heel" | "platform" | "wedge"
- shoe_closure (shoes only): "laces" | "velcro" | "slip-on" | "zip" | "buckle" | "elastic" | "strap" | "other"
- belt_style (accessory belts only): "plain" | "studded" | "perforated" | "woven" | "braided" | "chain" | "embellished" | "other"
- metal_finish (shoes/accessory hardware): "silver" | "gold" | "rose-gold" | "chrome" | "matte-silver" | "matte-gold" | "brass" | "bronze" | "gunmetal" | "mixed" | "none"

OTHER FIELDS:
- name: 2–5 words, concise and descriptive (e.g. "Blue cotton t-shirt", "Black leather ankle boots")
- colors: array of { hex: "#rrggbb", name: "plain-english color name" } — up to 3 dominant colors
- warmth_rating: integer 1–5 (1 = tank top / sandals, 3 = shirt / jeans, 5 = parka / heavy boots)
- rain_appropriate: true if the item is rainwear or a raincoat / waterproof shoe
- is_layering_piece: true only for open cardigans, vests, blazers, lightweight outerwear worn over a base layer
- belt_compatible: true for pants/skirts/dresses with visible belt loops or a defined waist

RULES:
- Only include fields relevant to the category (e.g. no neckline on bottoms, no shoe_height on dresses)
- Prefer a confident best guess over omitting — user reviews and edits
- Never invent values outside the enums above
- Respond with one JSON object, nothing else`;


export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType = (file.type || "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/webp"
      | "image/gif";

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
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

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    const parsed = JSON.parse(match[0]);
    // Drop anything that isn't on the enum allowlist. Claude occasionally
    // returns close-but-invalid values ("t_shirt" for "t-shirt", "blue"
    // in the material field) — keeping those would make the Supabase
    // insert fail with a check-constraint violation.
    return NextResponse.json(sanitizeAutoFill(parsed));
  } catch (err) {
    console.error("Item analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
