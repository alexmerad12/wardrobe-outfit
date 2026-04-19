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
    const { mood, occasion, styleWishes = [], anchorItemId = null } = (await request.json()) as {
      mood: Mood;
      occasion: Occasion;
      styleWishes?: string[];
      anchorItemId?: string | null;
    };

    const [itemsRes, prefsRes, outfitsRes] = await Promise.all([
      supabase.from("clothing_items").select("*").eq("is_stored", false),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("outfits")
        .select("*")
        .eq("is_favorite", true)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (itemsRes.error) {
      return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    }

    const items = (itemsRes.data ?? []) as ClothingItem[];
    const prefs = prefsRes.data;
    const favoriteOutfits = outfitsRes.data ?? [];

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

    const cachedPrefix = `You are Yav, an expert personal stylist AI. You combine fashion knowledge, current trends, and timeless style principles to create outfits. You understand color theory, texture pairing, proportions, layering, and how to dress for different occasions and moods.

WARDROBE:
${wardrobeList}${favoritesSection}`;

    const dynamicSuffix = `

WEATHER: ${weatherDesc}
SEASON: ${currentSeason}
MOOD: ${moodInfo.emoji} ${moodInfo.label} - ${moodInfo.description}
OCCASION: ${occasionLabel}${styleWishes.length > 0 ? `\nSTYLE DIRECTION: ${styleWishes.join(", ")}` : ""}${anchorItemId ? `\nANCHOR ITEM: The user specifically wants to wear the item with id [${anchorItemId}]. EVERY outfit MUST include this item. Build each look around it.` : ""}

Create exactly 3 outfit suggestions from the wardrobe items above. Each outfit should be a complete look.${styleWishes.length > 0 ? ` The user specifically wants: ${styleWishes.join(", ")}. Prioritize these styling wishes.` : ""}${anchorItemId ? ` CRITICAL: Every outfit must include the anchor item [${anchorItemId}]. Style DIFFERENT looks around it (different bottoms, shoes, layering) so the user sees variety in how to wear that piece.` : ""}

⚠️ HARD RULES - BREAKING THESE IS UNACCEPTABLE:

1. DRESSES ARE WORN ALONE AS THE FULL OUTFIT BASE.
   - If an outfit contains an item from the "dress" category (mini-dress, midi-dress, maxi-dress, jumpsuit), it MUST NOT contain ANY item from the "bottom" category (no jeans, no trousers, no shorts, no skirts, no leggings, no sweatpants - NOTHING).
   - Check every outfit you generate: if dress is in it, bottom MUST NOT be in it. This is non-negotiable.
   - A dress + shoes + (optional) outerwear/layering + (optional) accessory is the full valid structure.

2. ONE BASE PER OUTFIT:
   - Each outfit must have exactly ONE foundation - either a single dress/jumpsuit OR a top+bottom pair. Never both.

3. NO DUPLICATES FROM SAME CATEGORY:
   - Don't include two tops, two bottoms, or two dresses in one outfit.
   - EXCEPTION: One "layering piece" can go over a base top (vest over shirt, cardigan over tee, open shirt over tank). Only one layering piece per outfit.

4. CATEGORY CHECK:
   - Before finalizing each outfit, verify: does it violate any rule above? If yes, remove the violating item.

STYLING PRINCIPLES:
- Mix textures (e.g., denim with knit, leather with cotton)
- Balance proportions (fitted top with wider bottom, or vice versa)
- Consider color harmony but don't be boring - monochromatic looks, complementary accents, and tonal dressing all work
- Match metal finishes on accessories when possible (silver with silver, gold with gold)
- Layer thoughtfully - items marked as "layering piece" go over base layers
- Match warmth ratings to the weather
- Respect the occasion's formality level
- Consider the mood - bold moods get statement pieces, cozy moods get soft textures
- Learn from the user's favorites - if they tend toward certain combinations or styles, lean into that
- Think like a real stylist: unexpected but intentional pairings are better than safe/boring ones
- Include shoes and accessories when available - they complete the look

Also analyze the wardrobe for any gaps - staple pieces that are missing and would significantly improve outfit options (e.g. a neutral belt, white sneakers, a blazer, a basic white tee). Only mention a gap if it's genuinely useful, not just to fill space. If the wardrobe is well-rounded, don't suggest anything.

Respond with ONLY valid JSON in this exact format:
{
  "outfits": [
    {
      "item_ids": ["id1", "id2", "id3"],
      "reasoning": "2-3 sentences explaining the styling choices like a personal stylist would",
      "name": "A short creative name for this look"
    }
  ],
  "wardrobe_gap": "One sentence suggesting a staple piece to add, or null if the wardrobe is complete"
}

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
      outfits: { item_ids: string[]; reasoning: string; name: string }[];
      wardrobe_gap: string | null;
    };

    const suggestions = parsed.outfits.map((s) => {
      let outfitItems = s.item_ids
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as ClothingItem[];

      const hasDress = outfitItems.some((i) => i.category === "dress");
      if (hasDress) {
        outfitItems = outfitItems.filter((i) => i.category !== "bottom");
      }

      return {
        items: outfitItems,
        score: 1,
        reasoning: s.reasoning,
        color_harmony: "ai-styled",
        mood_match: mood,
        name: s.name,
        weather_temp: weather?.temp ?? null,
        weather_condition: weather?.condition ?? null,
      };
    });

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
