import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
import { getWeather, getSeasonFromMonth } from "@/lib/weather";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

const anthropic = new Anthropic();

function describeItem(item: ClothingItem): string {
  const parts: string[] = [`[${item.id}]`, item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);

  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);

  if (item.fit) parts.push(`Fit: ${item.fit}`);
  if (item.bottom_fit) parts.push(`Bottom fit: ${item.bottom_fit}`);
  if (item.length) parts.push(`Length: ${item.length}`);
  if (item.pants_length) parts.push(`Pant length: ${item.pants_length}`);
  if (item.waist_height) parts.push(`Waist: ${item.waist_height}`);
  if (item.waist_style) parts.push(`Waist style: ${item.waist_style}`);
  if (item.waist_closure) parts.push(`Waist closure: ${item.waist_closure}`);
  if (item.shoe_height) parts.push(`Height: ${item.shoe_height}`);
  if (item.heel_type) parts.push(`Heel: ${item.heel_type}`);
  if (item.shoe_closure) parts.push(`Shoe closure: ${item.shoe_closure}`);
  if (item.belt_style) parts.push(`Belt style: ${item.belt_style}`);
  if (item.metal_finish && item.metal_finish !== "none") parts.push(`Metal: ${item.metal_finish}`);
  if (item.neckline) parts.push(`Neckline: ${item.neckline}`);
  if (item.sleeve_length) parts.push(`Sleeves: ${item.sleeve_length}`);
  if (item.closure) parts.push(`Closure: ${item.closure}`);
  if (item.is_layering_piece) parts.push("(layering piece)");

  const mats = Array.isArray(item.material) ? item.material : [item.material];
  parts.push(`Material: ${mats.join(", ")}`);

  const pats = Array.isArray(item.pattern) ? item.pattern : [item.pattern];
  parts.push(`Pattern: ${pats.join(", ")}`);

  const formalities = Array.isArray(item.formality) ? item.formality : [item.formality];
  parts.push(`Formality: ${formalities.join(", ")}`);

  if (item.seasons.length) parts.push(`Seasons: ${item.seasons.join(", ")}`);
  if (item.occasions.length) parts.push(`Occasions: ${item.occasions.join(", ")}`);
  parts.push(`Warmth: ${item.warmth_rating}/5`);
  if (item.rain_appropriate) parts.push("Rain-proof");
  if (item.brand) parts.push(`Brand: ${item.brand}`);

  return parts.join(" | ");
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  try {
    const { mood, occasion, styleWishes = [], anchorItemId = null, locale = "en" } = (await request.json()) as {
      mood: Mood;
      occasion: Occasion;
      styleWishes?: string[];
      anchorItemId?: string | null;
      locale?: "en" | "fr";
    };

    const languageName = locale === "fr" ? "French" : "English";

    const [itemsRes, prefsRes, outfitsRes, recentRes] = await Promise.all([
      supabase.from("clothing_items").select("*").eq("is_stored", false),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("outfits")
        .select("*")
        .eq("is_favorite", true)
        .order("created_at", { ascending: false })
        .limit(5),
      // Last ~10 worn looks — used as the 'don't recycle these' signal
      // so the user gets fresh combinations across sessions.
      supabase
        .from("recent_outfits")
        .select("item_ids")
        .order("date", { ascending: false })
        .limit(10),
    ]);

    if (itemsRes.error) {
      return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    }

    const items = (itemsRes.data ?? []) as ClothingItem[];
    const prefs = prefsRes.data;
    const favoriteOutfits = outfitsRes.data ?? [];
    const recentItemSets = (recentRes.data ?? []) as { item_ids: string[] }[];

    if (items.length < 3) {
      return NextResponse.json({
        suggestions: [],
        message: "Add at least 3 items to get outfit suggestions",
      });
    }

    let weather: WeatherData | null = null;
    try {
      const location = prefs?.location;
      if (location?.lat && location?.lng) {
        weather = await getWeather(location.lat, location.lng);
      } else {
        weather = await getWeather(48.8566, 2.3522);
      }
    } catch {
      // proceed without weather
    }

    const currentSeason = getSeasonFromMonth(new Date().getMonth() + 1);

    const favorites = favoriteOutfits
      .map((o) => {
        const outfitItems = (o.item_ids as string[])
          .map((id: string) => items.find((i) => i.id === id))
          .filter(Boolean) as ClothingItem[];
        return {
          items: outfitItems.map((i) => `${i.name} (${i.category})`).join(" + "),
          mood: o.mood,
          occasion: o.occasions?.[0] ?? null,
          weather_temp: o.weather_temp,
          source: o.source,
        };
      })
      .filter((f) => f.items.length > 0);

    const wardrobeList = items.map(describeItem).join("\n");

    const weatherDesc = weather
      ? `${weather.temp}°C, feels like ${weather.feels_like}°C. ${weather.condition}. Humidity: ${weather.humidity}%, wind: ${weather.wind_speed}km/h, rain chance: ${weather.precipitation_probability}%.`
      : "Weather data unavailable.";

    const moodInfo = MOOD_CONFIG[mood];
    const occasionLabel = OCCASION_LABELS[occasion];

    const favoritesSection = favorites.length > 0
      ? `\n\nUSER'S FAVORITE OUTFITS (learn from these - they represent the user's style preferences):\n${favorites.map((f, i) => `${i + 1}. ${f.items}${f.mood ? ` | Mood: ${f.mood}` : ""}${f.occasion ? ` | Occasion: ${f.occasion}` : ""}${f.weather_temp !== null ? ` | ${f.weather_temp}°C` : ""}${f.source === "manual" ? " (manually created)" : ""}`).join("\n")}`
      : "";

    // Anti-repetition signal: surface the last ~10 worn item-id sets so
    // the model can deliberately bring NEW combinations rather than recycle
    // the same handful of safe pairings every session.
    const recentSection = recentItemSets.length > 0
      ? `\n\nRECENTLY SHOWN OR WORN (item-id sets — do NOT propose the same combinations; the user has already seen these):\n${recentItemSets.map((r, i) => `${i + 1}. [${r.item_ids.join(", ")}]`).join("\n")}`
      : "";

    const cachedPrefix = `You are Yav, an expert personal stylist AI — think senior editor at a fashion magazine, not a polite assistant. You compose outfits with: real color theory (complementary, analogous, monochromatic, tonal), proportion (rule of thirds, balance fitted with loose, cropped with high-waist), silhouette discipline (one focal point per look — never compete a statement piece against another), texture variety (mix matte/shine, structured/flowy, knit/leather), and editorial intent (looks should feel intentional and considered, never random or 'safe-but-boring'). You know when to break rules: a single 'wrong' element done with confidence (oversized blazer with slip dress, sneakers with a gown) reads as styling. Cluttered piling-on does not.

WARDROBE:
${wardrobeList}${favoritesSection}${recentSection}`;

    const dynamicSuffix = `

WEATHER: ${weatherDesc}
SEASON: ${currentSeason}
MOOD: ${moodInfo.emoji} ${moodInfo.label} - ${moodInfo.description}
OCCASION: ${occasionLabel}${styleWishes.length > 0 ? `\nSTYLE DIRECTION: ${styleWishes.join(", ")}` : ""}${anchorItemId ? `\nANCHOR ITEM: The user specifically wants to wear the item with id [${anchorItemId}]. EVERY outfit MUST include this item. Build each look around it.` : ""}

LANGUAGE: Write the outfit "name" and "reasoning" fields in ${languageName}. Item IDs stay as-is.

Create exactly 3 outfit suggestions from the wardrobe items above. Each outfit should be a complete look that matches ALL THREE of: the WEATHER (temperature + conditions), the MOOD, and the OCCASION above. Weather is not optional — a cozy look at −5°C must actually handle the cold; an at-home look on a 30°C day must not include a wool coat.

THE 3 OUTFITS MUST BE GENUINELY DIFFERENT FROM EACH OTHER. Not three variations of the same combo. Vary at least 2 of these dimensions across the set: silhouette (e.g. one with a dress, one with trousers, one with a skirt), color story (one bold/saturated, one neutral/tonal, one monochrome), structure (one tailored, one relaxed, one effortless). Avoid repeating the same anchor pair (same top + same bottom) twice. If the wardrobe has limited variety, still find genuinely different looks rather than three near-duplicates.${styleWishes.length > 0 ? ` The user specifically wants: ${styleWishes.join(", ")}. Prioritize these styling wishes.` : ""}${anchorItemId ? ` CRITICAL: Every outfit must include the anchor item [${anchorItemId}]. Style DIFFERENT looks around it (different bottoms, shoes, layering) so the user sees variety in how to wear that piece.` : ""}

⚠️ HARD RULES - BREAKING THESE IS UNACCEPTABLE:

1. DRESSES AND ONE-PIECE GARMENTS REPLACE THE BOTTOM.
   - If an outfit contains an item from the "dress" category (mini-dress, midi-dress, maxi-dress) OR the "one-piece" category (jumpsuit, overalls), it MUST NOT contain ANY item from the "bottom" category (no jeans, no trousers, no shorts, no skirts, no leggings, no sweatpants - NOTHING).
   - Check every outfit you generate: if dress or one-piece is in it, bottom MUST NOT be in it. This is non-negotiable.

   1a. WHETHER A TOP IS NEEDED UNDERNEATH:
   - Dresses (mini/midi/maxi) and JUMPSUITS: full coverage. Worn alone — DO NOT add a top.
   - OVERALLS (strap-style, bare chest area): MUST include a top underneath (t-shirt, blouse, tank, bodysuit, etc.). Never style overalls without a top.

2. EVERY OUTFIT NEEDS A COMPLETE BASE:
   - Each outfit MUST have exactly ONE foundation, and it MUST be complete. Valid bases:
     (a) a dress (mini/midi/maxi), OR
     (b) a jumpsuit, OR
     (c) an overalls + one top underneath, OR
     (d) one top + one bottom (jeans/trousers/skirt/shorts/leggings/sweatpants).
   - Never combine a dress/jumpsuit with a bottom. Overalls are the only exception: they ALWAYS pair with a top.
   - A top alone is NOT an outfit. A top + shoes is NOT an outfit. If you can't find a suitable bottom in the wardrobe, skip that outfit entirely rather than sending something incomplete.

3. NO DUPLICATES — MAX ONE ITEM PER SUBCATEGORY:
   - Don't include two tops, two bottoms, two dresses, two pairs of shoes, two belts, two hats, two bags, etc. EVER. One per subcategory across the whole outfit.
   - EXCEPTIONS:
     a. One TOP marked '(layering piece)' (vest, cardigan, open shirt) can go OVER a base top — counts as 1 layering top + 1 base top, not duplicates.
     b. ONE outerwear piece (jacket / blazer / coat / cardigan-as-outerwear) layered over a top is normal styling, NOT a duplicate.
   - Two pieces of the SAME subcategory (two belts, two scarves, two pairs of boots) are forbidden no matter what.

4. CATEGORY CHECK:
   - Before finalizing each outfit, verify: does it violate any rule above? If yes, remove the violating item or drop the outfit.

5. WEATHER MATCH:
   - The WEATHER value at the top tells you today's temperature and conditions. Every outfit MUST be appropriate for it.
   - <5°C: include heavy outerwear (coat / puffer / parka) whenever the wardrobe has it. Warmth rating 4–5 pieces, closed shoes / boots. No shorts / skirts without tights, no sandals, no tank tops as the only top.
   - 5–12°C: include outerwear (jacket / cardigan / blazer / coat) whenever the wardrobe has a piece that fits the look. Long sleeves, closed shoes. No sandals, no shorts. (Even indoor occasions like Dinner Out or Work — the user has to get there.)
   - 12–18°C: long sleeves or layered short sleeves, optional light jacket/cardigan. Jeans / trousers or midi skirts work; shorts only if the user's pieces clearly handle it.
   - 18–25°C: short sleeves / t-shirts / blouses, shorts / skirts / trousers, sneakers / flats / sandals. No heavy coats.
   - >25°C: lightest pieces (tank, t-shirt, shorts, sundress), breathable materials (cotton, linen, mesh). NO sweaters, NO wool, NO heavy jackets, NO boots.
   - Rain chance ≥ 40%: prefer items marked "Rain-proof" when available; avoid suede / canvas / delicate pieces.
   - Match the Warmth rating on each item to the temp — don't mix a warmth-5 coat with warmth-2 pieces on a warm day, or vice versa.
   - If the wardrobe is missing a key cold-weather piece (no outerwear at all, no closed shoes, etc.), STILL generate an outfit with what's available, and call out the gap in wardrobe_gap so the user knows what to add.

OCCASION-SPECIFIC GUIDANCE:
- "At Home" (loungewear): prioritize soft, stretchy, comfortable pieces (sweatpants, leggings, hoodies, cozy knits, oversized tees, lounge sets). Shoes are OPTIONAL and should be skipped unless the user has truly casual indoor shoes (slippers, house sneakers) — don't force heels / boots / formal shoes. Bags should NOT appear in at-home outfits. Keep layering minimal; at home you want one top max, not sweater + cardigan.
- "Work" / "Date Night" / "Party" / "Dinner Out": shoes complete the look, include them.

MOOD-SPECIFIC GUIDANCE:
- "Comfort Day" / "Cozy" / "Need a Hug": prefer soft, stretchy, warm materials (knit, fleece, cotton, jersey). AVOID stiff denim, fitted tailoring, and multiple layers stacked together. One cozy piece is enough — don't put a cardigan over a heavy sweater.
- "Bold" / "Confident" / "Playful": statement pieces, bolder color combos, more thoughtful layering.
- "Chill": relaxed fits, simple pairings, nothing fussy.

STYLING PRINCIPLES (real-stylist logic, not generic safe pairings):
- One focal point per outfit. The standout item (statement coat, bold print, sequined piece, sculptural shoe) carries the look — surround it with quieter pieces. Two statement items in the same outfit fight each other.
- Texture is what makes 'simple' look intentional. Mix at least two textures: denim + silk, leather + knit, cotton + satin, wool + leather. All-cotton head-to-toe reads flat.
- Proportion math: fitted with loose, cropped with high-waist, voluminous top with slim bottom (or vice versa). Avoid same-fit head-to-toe unless monochrome and intentional.
- Color stories: pick ONE — monochromatic (one color, varied tones), tonal (close neighbors), complementary (one accent against neutrals), or true contrast (a confident bold pop). Don't just throw colors together.
- Hardware + accessories cohere: match metals (silver with silver, gold with gold) and tonal hardware (cool tones with cool, warm with warm).
- Layering is a styling MOVE, not just warmth: open over base, contrast textures, let an undershirt peek out, push sleeves up, leave a button undone. The styling_tip is where these moves live.
- USE THE OUTERWEAR. If the wardrobe has jackets, blazers, vests, or coats, they are style finishers — not just weather gear. A blazer over a tee elevates the look. A denim jacket adds texture. An open cardigan adds depth. Across 3 outfits, default to including outerwear in at least 2 of them when the user has options. Skip only when the temperature is genuinely too warm (>22°C) or the silhouette is already fully developed (e.g., a statement dress that doesn't need a layer).
- Tucking, cuffing, half-buttoning, sleeve-pushing — these small actions are what separate 'wearing clothes' from 'styled'. Always include at least one specific action in styling_tip when there's room.
- Don't pile on. Empty space is a tool. Outfits with too many pieces (5+ small details, layered + belt + scarf + jewelry + bag) feel cluttered, not curated.
- The occasion sets the floor for formality, the mood sets the energy, the weather sets the materials. All three must align.
- Lean into the user's favorites for what to repeat (silhouette, color preference, formality level), but always bring at least one fresh angle they haven't seen yet.
- Match warmth ratings to the weather; don't mix warmth-1 and warmth-5 in the same outfit unless one is genuine outerwear over a base.
- Respect the occasion's formality (see OCCASION-SPECIFIC GUIDANCE) and the mood (see MOOD-SPECIFIC GUIDANCE).
- Include shoes when the occasion calls for them (everything except At Home).

Also analyze the wardrobe for any gaps - staple pieces that are missing and would significantly improve outfit options (e.g. a neutral belt, white sneakers, a blazer, a basic white tee). Only mention a gap if it's genuinely useful, not just to fill space. If the wardrobe is well-rounded, don't suggest anything.

Respond with ONLY valid JSON in this exact format:
{
  "outfits": [
    {
      "item_ids": ["id1", "id2", "id3"],
      "reasoning": "ONE short sentence — the why. Note in passing how it suits the weather / mood / occasion. Refer to pieces GENERICALLY by category or shape (the dress, the boots, the blazer, the tee), NEVER by brand, color, material, or specific item name. Keep it tight.",
      "styling_tip": "ONE concrete how-to-wear sentence with specific layering / styling actions for THIS outfit. Refer to pieces GENERICALLY (the cardigan, the jeans, the blouse) — NEVER by brand, color, or material. Examples: 'Tuck the front of the tee into the bottoms and roll the cuffs once', 'Wear the blazer open over the dress with sleeves pushed up', 'Layer the cardigan over the top and leave it unbuttoned'. If there's nothing useful to add (the outfit is just a dress + shoes), set this to null.",
      "name": "A short creative name for this look"
    }
  ],
  "wardrobe_gap": "One sentence suggesting a staple piece to add, or null if the wardrobe is complete"
}

⚠️ CRITICAL — DESCRIPTION INTEGRITY (this is the #1 bug to avoid):
- BEFORE you write reasoning and styling_tip for an outfit, explicitly list to yourself the CATEGORIES actually in your item_ids array for that outfit. Example: "item_ids has [dress, shoes, belt] → allowed words: the dress, the shoes, the belt."
- The reasoning and styling_tip must ONLY reference those categories. If the outfit has no top, NEVER write "tank", "tee", "blouse", "shirt", "sweater". If it has no bottom, NEVER write "jeans", "trousers", "pants", "skirt". If it has no jacket / blazer / coat, NEVER mention layering or outerwear. Mentioning a piece you did not actually pick is a CRITICAL failure — the user sees the outfit photo and the text doesn't match.
- Use BROAD CATEGORY ONLY — the ONLY allowed vocabulary for referring to pieces is: the top, the bottom, the dress, the one-piece, the jacket / coat / blazer, the shoes, the bag, the belt, the accessory.
- FORBIDDEN words in reasoning and styling_tip: "t-shirt", "tee", "tank", "blouse", "shirt", "sweater", "cardigan" (unless actually in outfit), "jeans", "trousers", "pants", "leggings", "shorts", "skirt", "boots", "sneakers", "heels", "sandals", "flats", "moto", "bomber", "denim", "leather", "silk", "satin", "cotton", "wool", "linen" — plus any brand name, any color name, any material name. Subcategory and material words trip the hallucination; stick to the broad category only.
- If the outfit is just a dress and shoes, your reasoning says "the dress + the shoes" — NOT "the maxi dress with boots."

Use ONLY item IDs from the wardrobe list above (the [id] values). Include 3-6 items per outfit.`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: cachedPrefix, cache_control: { type: "ephemeral" } },
            { type: "text", text: dynamicSuffix },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ suggestions: [], message: "Failed to parse AI response" });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      outfits: { item_ids: string[]; reasoning: string; styling_tip?: string | null; name: string }[];
      wardrobe_gap: string | null;
    };

    const suggestions = parsed.outfits
      .map((s) => {
        const outfitItems = s.item_ids
          .map((id) => items.find((i) => i.id === id))
          .filter(Boolean) as ClothingItem[];

        // Detect rule violations. If ANY rule is broken we drop the whole
        // outfit below — silently stripping items leaves the reasoning /
        // styling_tip text referencing pieces that aren't in the outfit
        // anymore, which is the hallucination bug the user saw.
        const hasDress = outfitItems.some((i) => i.category === "dress");
        const hasOnePiece = outfitItems.some((i) => i.category === "one-piece");
        const hasBottom = outfitItems.some((i) => i.category === "bottom");
        const dressWithBottom = (hasDress || hasOnePiece) && hasBottom;

        const seenSubs = new Set<string>();
        let duplicateSub = false;
        for (const i of outfitItems) {
          if (!i.subcategory) continue;
          if (seenSubs.has(i.subcategory)) {
            duplicateSub = true;
            break;
          }
          seenSubs.add(i.subcategory);
        }

        return {
          items: outfitItems,
          score: 1,
          reasoning: s.reasoning,
          styling_tip: s.styling_tip ?? null,
          color_harmony: "ai-styled",
          mood_match: mood,
          name: s.name,
          weather_temp: weather?.temp ?? null,
          weather_condition: weather?.condition ?? null,
          _violations: { dressWithBottom, duplicateSub },
        };
      })
      // Drop any outfit that violates hard rules (dress+bottom, duplicate
      // subcategory) OR is missing a valid base. Stripping items silently
      // causes the description text to reference pieces that got removed,
      // so it's safer to drop the whole outfit and let the user re-roll.
      .filter((s) => {
        if (s._violations.dressWithBottom) return false;
        if (s._violations.duplicateSub) return false;
        const hasDress = s.items.some((i) => i.category === "dress");
        const hasOnePiece = s.items.some((i) => i.category === "one-piece");
        const hasTop = s.items.some((i) => i.category === "top");
        const hasBottom = s.items.some((i) => i.category === "bottom");
        const isOveralls = s.items.some(
          (i) => i.category === "one-piece" && i.subcategory === "overalls"
        );
        if (hasDress) return true;
        if (hasOnePiece) return !isOveralls || hasTop;
        return hasTop && hasBottom;
      })
      .map(({ _violations: _v, ...rest }) => rest);

    return NextResponse.json({
      suggestions,
      wardrobe_gap: parsed.wardrobe_gap ?? null,
    });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
