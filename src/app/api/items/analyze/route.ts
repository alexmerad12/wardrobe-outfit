import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import { withGeminiRetry } from "@/lib/gemini-retry";

// Item analysis runs on Gemini 3 Flash Preview via @google/genai with
// thinking disabled. The existing sanitizeAutoFill handles enum
// validation, so we don't need a strict responseSchema.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

// Static instructions + full enum list. Cached across requests so each call
// only pays for the (unique) image tokens + the ~200-token JSON output.
const SYSTEM_PROMPT = `You are a fashion expert analyzing a single clothing item photo. Return ONLY a JSON object — no preamble, no markdown fences, no explanation.

For each field, pick ONE of the allowed values below. Omit the field if genuinely indeterminate. Arrays may have 1-3 entries.

ENUMS:
- category: "top" | "bottom" | "dress" | "one-piece" | "outerwear" | "shoes" | "bag" | "accessory"
- subcategory (must match the category):
  • top: "t-shirt" | "blouse" | "shirt" | "tank-top" | "crop-top" | "sweater" | "hoodie" | "cardigan"
  • bottom: "jeans" | "trousers" | "shorts" | "skirt" | "skort" | "leggings" | "sweatpants"
  • dress: "mini-dress" | "midi-dress" | "maxi-dress"
  • one-piece: "jumpsuit" | "overalls"
  • outerwear: "jacket" | "coat" | "blazer" | "vest" | "windbreaker" | "puffer" | "bomber" | "denim-jacket" | "leather-jacket" | "trench-coat" | "peacoat" | "parka"
  • shoes: "sneakers" | "boots" | "combat-boots" | "western-boots" | "chelsea-boots" | "ankle-boots" | "knee-boots" | "heels" | "sandals" | "flats" | "ballet-flats" | "loafers" | "mules" | "espadrilles"
  • bag: "handbag" | "backpack" | "tote" | "clutch" | "crossbody"
  • accessory: "belt" | "scarf" | "hat" | "sunglasses"
- pattern (array): "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embellished" | "other" — "embellished" covers embroidery, beading, sequins, appliqué, stud work (any visually-textured decoration). Combine with a motif tag (e.g. ["embellished","floral"]) when the embellishment forms a recognizable motif.
- material (array): "cotton" | "denim" | "wool" | "silk" | "leather" | "knit" | "polyester" | "linen" | "canvas" | "cashmere" | "chiffon" | "corduroy" | "faux-fur" | "faux-leather" | "faux-suede" | "flannel" | "fleece" | "fur-shearling" | "jersey" | "lace" | "mesh" | "modal" | "nylon" | "patent-leather" | "rayon-viscose" | "rubber" | "satin" | "sheer" | "spandex" | "suede" | "tencel" | "tulle" | "tweed" | "twill" | "velvet" | "other"
- formality (array): "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal"
- seasons (array): "spring" | "summer" | "fall" | "winter"
- occasions (array): "work" | "casual" | "brunch" | "dinner-out" | "date" | "outdoor" | "travel" | "party" | "formal" | "at-home"
- fit: "slim" | "regular" | "loose" | "oversized"
- bottom_fit (bottoms only): "skinny" | "slim" | "straight" | "regular" | "wide-leg" | "flared" | "bootcut" | "tapered"
- length (tops/outerwear only): "cropped" | "regular" | "long" | "extra-long"
- pants_length (bottoms only): "capri" | "ankle-crop" | "ankle" | "full" | "extra-long"
- waist_style: "elastic" | "fitted" | "relaxed" | "belted"
- waist_height (bottoms only): "high" | "mid" | "low"
- waist_closure (bottoms only): "button-zip" | "elastic" | "drawstring" | "tie" | "hook-eye" | "pull-on" | "side-zip" | "other"
- neckline (tops/dresses/outerwear): "crew" | "v-neck" | "scoop" | "square" | "boat" | "turtleneck" | "mock-neck" | "halter" | "one-shoulder" | "off-shoulder" | "asymmetric" | "collared" | "henley" | "cowl" | "sweetheart" | "other" (use "asymmetric" for biker/moto jackets with the diagonal zip and angled lapel)
- sleeve_length (tops/dresses/outerwear): "strapless" | "spaghetti" | "thin-strap" | "wide-strap" | "sleeveless" | "cap" | "short" | "elbow" | "three-quarter" | "long" | "other"
- closure (tops/dresses/outerwear): "pullover" | "full-button" | "partial-button" | "zipper" | "wrap-tie" | "snap" | "hook-eye" | "open-drape" | "other"
- shoe_height (shoes only): "low" | "ankle" | "mid" | "knee" | "over-knee"
- heel_type (shoes only): "flat" | "low-heel" | "mid-heel" | "high-heel" | "platform" | "wedge"
- shoe_closure (shoes only): "laces" | "velcro" | "slip-on" | "zip" | "buckle" | "elastic" | "strap" | "other"
- belt_style (accessory belts only): "plain" | "studded" | "perforated" | "woven" | "braided" | "chain" | "embellished" | "other"
- metal_finish (shoes/accessory hardware): "silver" | "gold" | "rose-gold" | "chrome" | "matte-silver" | "matte-gold" | "brass" | "bronze" | "gunmetal" | "mixed" | "none"
- bag_size (only for category="bag"): "clutch" | "small" | "medium" | "large" | "tote". Clutch = evening / wristlet-size. Small = mini bag / small crossbody. Medium = everyday handbag. Large = shoulder bag that holds a laptop. Tote = oversized carry-all / weekender.
- bag_texture (only for category="bag"): "smooth" | "woven" | "quilted" | "pebbled" | "croc-embossed" | "snake-embossed" | "fringed" | "other". Quilted = diamond/chevron stitching (Chanel flap). Woven = basketweave / rattan / leather weave. Pebbled = textured grain (Coach, Prada Saffiano). Croc/snake-embossed = faux reptile pattern stamped into the leather. Fringed = hanging fringe detail.
- hat_texture (only for category="accessory" and subcategory="hat"): "felt" | "straw" | "knit" | "canvas" | "leather" | "velvet" | "other". Felt = structured wool felt (fedora, panama, bowler). Straw = woven straw (boater, wide-brim sun hat). Knit = beanie, knit beret, knit headband. Canvas = baseball cap, bucket hat, lightweight cap. Leather = leather cap, leather bowler. Velvet = velvet beret, formal evening hat.
- sunglasses_style (only for category="accessory" and subcategory="sunglasses"): "aviator" | "wayfarer" | "cat-eye" | "round" | "oversized" | "rectangle" | "sport" | "shield" | "other". Aviator = teardrop double-bridge metal frames. Wayfarer = trapezoidal Ray-Ban-style. Cat-eye = upswept outer corners. Round = circular John Lennon style. Oversized = large square/round Jackie-O style. Rectangle = narrow horizontal frames. Sport = wraparound performance frames. Shield = single one-piece lens.
- dress_silhouette (only for category="dress"): "a-line" | "sheath" | "bodycon" | "wrap" | "fit-and-flare" | "slip" | "shift" | "empire" | "mermaid". A-line = fitted bodice, triangle-flare skirt. Sheath = straight-cut, follows body without defined waist. Bodycon = clingy stretch. Wrap = V-neck with tie waist (DVF style). Fit-and-flare = nipped waist + full skirt. Slip = minimal lingerie-style with thin straps. Shift = straight 60s cut, no waist definition. Empire = seam under the bust. Mermaid = fitted through hips, dramatic flare below knee. Pick the single best match; if unsure between sheath and bodycon, default to sheath.
- toe_shape (only for category="shoes"): "round" | "almond" | "pointed" | "square" | "peep-toe" | "open-toe". Round = the default comfort shape. Almond = subtly pointed oval (most pumps). Pointed = sharp V shape (classic pump). Square = flat-front blocky toe (trendy, 90s). Peep-toe = closed shoe with a small toe opening. Open-toe = sandal / strappy / no closed front.
- hat_silhouette (only for category="accessory" and subcategory="hat"): "baseball" | "trucker" | "bucket" | "fedora" | "beret" | "beanie" | "pillbox" | "headband" | "sun-hat" | "other". Baseball = curved-brim cap with structured crown. Trucker = mesh-back snapback / 5-panel. Bucket = soft full-brim cylindrical. Fedora = pinched-crown structured felt. Beret = soft round flat. Beanie = knit close-fitting. Pillbox = small flat round formal. Headband = narrow head wrap. Sun-hat = wide-brim straw. Pick the silhouette that best matches the visible shape, ignoring color.
- scarf_function (only for category="accessory" and subcategory="scarf"): "decorative" | "functional". Functional = thick knit / wool / cashmere meant for warmth (warmth_rating ≥ 3). Decorative = thin silk / chiffon / satin worn as a styling accent (warmth_rating ≤ 2). Use the visible weight/fabric to decide.
- skirt_length (only for category="bottom" and subcategory="skirt"): "mini" | "knee-length" | "midi" | "maxi". Mini = above the knee. Knee-length = hits the knee. Midi = mid-calf to just above the ankle. Maxi = ankle or floor length.
- bag_metal_finish (only for category="bag"): same enum as metal_finish — "silver" | "gold" | "rose-gold" | "chrome" | "matte-silver" | "matte-gold" | "brass" | "bronze" | "gunmetal" | "mixed" | "none". The dominant metal of any visible bag hardware (clasps, chain straps, buckles, logo plates). Use "none" if the bag has no visible metal (e.g., all-fabric tote with no closure hardware).

OTHER FIELDS:
- name: 2–5 words, concise and descriptive (e.g. "Blue cotton t-shirt", "Black leather ankle boots")
- colors: array of { hex: "#rrggbb", name: "Plain English color name in Title Case" } — up to 3 dominant colors. Use Title Case ("Black", "Navy Blue", "Dark Brown") not lowercase or ALL CAPS.
- warmth_rating: number from 1 to 5 in 0.5 increments (1, 1.5, 2, 2.5, ... 5). 1 = tank top / sandals / thin bandana, 3 = shirt / jeans / sneakers, 5 = parka / heavy winter boots / chunky winter scarf. Scarves span the whole range (silk bandana 1-2, knit winter scarf 4-5). Shoes span the whole range too: open sandals/espadrilles 1, ballet flats/loafers/sneakers 2-3, ankle boots 3-4, insulated or knee boots 4-5.
- is_layering_piece: true only for open cardigans, vests, blazers, lightweight outerwear worn over a base layer
- belt_compatible: true for pants/skirts/dresses with visible belt loops or a defined waist

CATEGORY DISAMBIGUATION (common misclassifications):
- A "shirt" with a hood is a "hoodie" (subcategory), category stays "top"
- A zip-front knit top is a "cardigan", not a "sweater"
- A button-front shirt that's relaxed but tucked-in-appropriate is still a "shirt", not a "blouse" (reserve "blouse" for dressier drapey cuts)
- Corduroy/quilted jacket = outerwear/"jacket"; structured wool jacket = outerwear/"blazer"
- Denim jacket in outerwear is ALWAYS "denim-jacket", never generic "jacket"
- Leather/faux-leather jackets → "leather-jacket" regardless of length
- Technical waterproof outer layer → "windbreaker" or "raincoat"-style "jacket"
- Quilted puffy insulated jacket → "puffer"
- Calf-length formal coat → "trench-coat" or "peacoat" (peacoat = double-breasted wool, trench = belted gabardine); fall back to "coat" otherwise
- Shorts with an elastic waist and drawstring and not athletic = casual shorts, set subcategory "shorts"; athletic versions → also "shorts" but warmth_rating 1
- Jumpsuit vs. dress: if legs are separated into pant legs, it's "jumpsuit"; otherwise a dress subcategory
- Heels vs boots: "heels" only if open-back or low-cut; anything ankle-or-higher is a boot subcategory

MATERIAL GUIDANCE:
- Cotton looks matte, slight weave. Smooth stretchy T-shirt fabric in cotton/poly blend is "jersey" (its own material now).
- "Knit" is for obvious loops/cables (sweaters, cardigans) — smooth T-shirts are "cotton" or "jersey", not knit.
- "Cashmere" only for clearly luxury knit with a softer, finer drape than wool — don't label every sweater cashmere.
- "Fleece" is plush synthetic fuzz (sweatshirts, pullovers); "flannel" is brushed plaid shirting.
- "Rayon-viscose" for drapey, silky-feeling plant-based fabric (most summer dresses/blouses labeled "viscose" or "rayon").
- "Modal" / "tencel" are eucalyptus/beech cellulosics — use when labeled, else default to rayon-viscose.
- "Jersey" for smooth knit (the stretchy fabric of most tees / joggers / bodycon dresses).
- "Tweed" is structured woven texture with visible fibers (classic Chanel jacket); "twill" is diagonal weave (chinos, suiting).
- "Spandex" / elastane is rarely the only material — use only if the item is essentially all stretch (shapewear, leggings). Otherwise prefer the primary fiber.
- Denim is only denim — don't label chambray or canvas as denim.
- "Leather" is the default for shiny supple hide; use "faux-leather" only if clearly synthetic (thinner, stiffer).
- Default to ONE material entry. Only add a second if two are clearly visible (e.g. cotton shirt with lace trim).

FIT/WARMTH INTUITION:
- warmth_rating (0.5 steps): 1 = tank/sandals/shorts/thin bandana, 2 = light tee/skirt, 3 = long-sleeve shirt/jeans, 4 = sweater/wool coat, 5 = heavy parka/insulated boots/chunky winter scarf — use the half-steps (1.5, 2.5, 3.5, 4.5) when the item sits between categories
- is_layering_piece: open cardigans, blazers, open-drape/vest pieces. NOT crewneck sweaters or pullovers.

RULES:
- Only include fields relevant to the category (e.g. no neckline on bottoms, no shoe_height on dresses)
- Prefer a confident best guess over omitting — user reviews and edits. When between two close enum values, pick the more specific one.
- Never invent values outside the enums above. If unsure, omit the field rather than invent.
- Respond with one JSON object, nothing else`;


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
                { text: SYSTEM_PROMPT },
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
