import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { kv } from "@vercel/kv";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";
import { getWeather, getSeasonFromMonth } from "@/lib/weather";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Suggest endpoint runs on Gemini 3 Flash via the new @google/genai
// SDK so we can disable internal "thinking" (the legacy SDK can't
// expose that knob). Thinking off + Gemini 3 Flash lands a 4-outfit
// response in ~5s on this rules-heavy prompt vs ~26s with thinking on.
// Packing still uses Anthropic via its own client. GOOGLE_API_KEY must
// be set in .env.local locally and in Vercel env settings for deploys.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

const SUGGEST_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    outfits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item_ids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          name: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          styling_tip: { type: Type.STRING, nullable: true },
        },
        required: ["item_ids", "name", "reasoning"],
      },
    },
    wardrobe_gap: { type: Type.STRING, nullable: true },
  },
  required: ["outfits"],
};

// ─────────────────────────────────────────────────────────────────
// Server-side description builder. We used to let the AI write the
// reasoning and styling_tip, but the AI hallucinated categories that
// weren't in item_ids ("the moto jacket" when there was no jacket).
// Every prompt tweak to stop this either left the hallucination intact
// or made the validator drop outfits, so we stopped asking the AI for
// prose and now compose a short sentence from the actual item_ids.
// Always accurate; nothing to hallucinate.
// ─────────────────────────────────────────────────────────────────
type Locale = "en" | "fr";

function pieceLabel(item: ClothingItem, locale: Locale): string {
  const cat = item.category;
  const sub = item.subcategory ?? "";
  if (locale === "fr") {
    if (cat === "dress") return "la robe";
    if (cat === "one-piece") return sub === "overalls" ? "la salopette" : "la combinaison";
    if (cat === "top") return "le haut";
    if (cat === "bottom") {
      if (sub === "skirt") return "la jupe";
      if (sub === "shorts") return "le short";
      return "le pantalon";
    }
    if (cat === "outerwear") {
      if (sub === "blazer") return "le blazer";
      if (sub === "coat" || sub === "trench-coat" || sub === "peacoat" || sub === "parka") return "le manteau";
      if (sub === "vest") return "le gilet";
      return "la veste";
    }
    if (cat === "shoes") return "les chaussures";
    if (cat === "bag") return "le sac";
    if (cat === "accessory") {
      if (sub === "belt") return "la ceinture";
      if (sub === "scarf") return "l'écharpe";
      if (sub === "hat") return "le chapeau";
      return "l'accessoire";
    }
    return "la pièce";
  }
  // English
  if (cat === "dress") return "the dress";
  if (cat === "one-piece") return sub === "overalls" ? "the overalls" : "the jumpsuit";
  if (cat === "top") return "the top";
  if (cat === "bottom") {
    if (sub === "skirt") return "the skirt";
    if (sub === "shorts") return "the shorts";
    return "the bottoms";
  }
  if (cat === "outerwear") {
    if (sub === "blazer") return "the blazer";
    if (sub === "coat" || sub === "trench-coat" || sub === "peacoat" || sub === "parka") return "the coat";
    if (sub === "vest") return "the vest";
    return "the jacket";
  }
  if (cat === "shoes") return "the shoes";
  if (cat === "bag") return "the bag";
  if (cat === "accessory") {
    if (sub === "belt") return "the belt";
    if (sub === "scarf") return "the scarf";
    if (sub === "hat") return "the hat";
    return "the accessory";
  }
  return "the piece";
}

// Read the outfit's pieces in a natural order (base → layers → feet →
// extras) so the resulting sentence flows the way a person would read
// the outfit top-to-bottom.
function orderedPieces(items: ClothingItem[]): ClothingItem[] {
  const rank: Record<string, number> = {
    dress: 0,
    "one-piece": 0,
    top: 1,
    bottom: 2,
    outerwear: 3,
    shoes: 4,
    bag: 5,
    accessory: 6,
  };
  return [...items].sort(
    (a, b) => (rank[a.category] ?? 9) - (rank[b.category] ?? 9)
  );
}

function joinList(parts: string[], locale: Locale): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const and = locale === "fr" ? " et " : " and ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}

function moodTone(mood: Mood, locale: Locale): string {
  if (locale === "fr") {
    const map: Record<Mood, string> = {
      energized: "plein d'énergie",
      confident: "soigné",
      playful: "ludique",
      cozy: "douillet",
      chill: "décontracté",
      bold: "affirmé",
      period: "tout en confort",
      sad: "tout en douceur",
    };
    return map[mood];
  }
  const map: Record<Mood, string> = {
    energized: "fresh",
    confident: "polished",
    playful: "playful",
    cozy: "cozy",
    chill: "easy",
    bold: "statement-ready",
    period: "comfort-first",
    sad: "soft and gentle",
  };
  return map[mood];
}

function occasionLabelLocalized(occasion: Occasion, locale: Locale): string {
  if (locale === "fr") {
    const map: Record<Occasion, string> = {
      "at-home": "à la maison",
      casual: "un look casual",
      hangout: "un moment entre amis",
      brunch: "un brunch",
      sport: "le sport",
      outdoor: "une sortie en plein air",
      travel: "un voyage",
      "dinner-out": "un dîner dehors",
      work: "le travail",
      date: "un rendez-vous",
      party: "une soirée",
      formal: "un événement habillé",
    };
    return map[occasion];
  }
  // Existing OCCASION_LABELS gives Title-Case nouns; lowercase them so
  // they read naturally mid-sentence ("polished for dinner out").
  return OCCASION_LABELS[occasion].toLowerCase();
}

function buildReasoning(
  items: ClothingItem[],
  mood: Mood,
  occasion: Occasion,
  weather: WeatherData | null,
  locale: Locale
): string {
  const ordered = orderedPieces(items);
  const labels = ordered.map((i) => pieceLabel(i, locale));
  const piecesList = joinList(labels, locale);
  const tone = moodTone(mood, locale);
  const occ = occasionLabelLocalized(occasion, locale);
  const temp = weather?.temp;
  const includeTemp = typeof temp === "number" && (temp <= 12 || temp >= 25);

  if (locale === "fr") {
    const capitalized = piecesList.charAt(0).toUpperCase() + piecesList.slice(1);
    return includeTemp
      ? `${capitalized} — ${tone} pour ${occ} à ${temp}°C.`
      : `${capitalized} — ${tone} pour ${occ}.`;
  }
  const capitalized = piecesList.charAt(0).toUpperCase() + piecesList.slice(1);
  return includeTemp
    ? `${capitalized} — ${tone} for ${occ} at ${temp}°C.`
    : `${capitalized} — ${tone} for ${occ}.`;
}

// Trim AI prose down to a single sentence. Anthropic sometimes returns
// two or three sentences even when we ask for one; this captures the
// first clause up through its terminal punctuation.
function oneSentence(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.trim();
  const match = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

// Every category-signal word that would betray a hallucination. If the AI
// writes "the moto jacket" when no outerwear is in item_ids, we swap in
// server-built text instead of showing the mismatch. Unlike the previous
// round of validation this list is broader — we trust the fallback so we
// can afford to reject more aggressively without starving the UI.
const HALLUCINATION_WORDS: Record<string, string[]> = {
  top: ["t-shirt", "tshirt", "tee", "tank", "blouse", "shirt", "sweater", "hoodie", "cardigan", "pullover"],
  bottom: ["jeans", "trousers", "pants", "leggings", "sweatpants", "shorts", "skirt", "chinos", "slacks"],
  dress: ["dress", "gown", "sundress", "maxi dress", "midi dress", "mini dress"],
  "one-piece": ["jumpsuit", "overalls", "romper"],
  outerwear: ["jacket", "blazer", "coat", "windbreaker", "puffer", "bomber", "moto", "trench", "peacoat", "parka", "biker"],
  shoes: ["boot", "sneaker", "heel", "sandal", "loafer", "mule", "oxford", "pump"],
  bag: ["handbag", "backpack", "tote", "clutch", "crossbody", "purse"],
  accessory: ["belt", "scarf", "beanie"],
};

function textIsConsistent(items: ClothingItem[], text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const present = new Set(items.map((i) => i.category));
  for (const [cat, words] of Object.entries(HALLUCINATION_WORDS)) {
    if (present.has(cat as ClothingItem["category"])) continue;
    for (const w of words) {
      const escaped = w.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(`\\b${escaped}s?\\b`, "i");
      if (rx.test(lower)) return false;
    }
  }
  return true;
}

function buildStylingTip(items: ClothingItem[], locale: Locale): string | null {
  const outerwear = items.find((i) => i.category === "outerwear");
  const hasBase =
    items.some((i) => i.category === "dress") ||
    items.some((i) => i.category === "one-piece") ||
    (items.some((i) => i.category === "top") &&
      items.some((i) => i.category === "bottom"));
  const belt = items.find((i) => i.category === "accessory" && i.subcategory === "belt");
  const overalls = items.find((i) => i.category === "one-piece" && i.subcategory === "overalls");
  const topTuckable = items.some(
    (i) =>
      i.category === "top" &&
      !i.is_layering_piece &&
      i.subcategory !== "hoodie" &&
      i.subcategory !== "sweater"
  );
  const hasBottom = items.some((i) => i.category === "bottom");

  if (outerwear && hasBase) {
    const ow = pieceLabel(outerwear, locale);
    return locale === "fr"
      ? `Porte ${ow} ouvert·e par-dessus la base pour du mouvement.`
      : `Wear ${ow} open over the base for movement.`;
  }
  if (belt && hasBottom && topTuckable) {
    return locale === "fr"
      ? `Rentre le haut à l'avant et cinch avec la ceinture.`
      : `Tuck the top at the front and cinch with the belt.`;
  }
  if (overalls) {
    return locale === "fr"
      ? `Laisse les bretelles un peu lâches pour un tombé plus décontracté.`
      : `Leave the straps slightly loose for an easy fit.`;
  }
  if (topTuckable && hasBottom) {
    return locale === "fr"
      ? `Rentre simplement le devant du haut dans le bas.`
      : `Tuck just the front of the top into the bottoms.`;
  }
  return null;
}

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
  if (item.bag_size) parts.push(`Bag size: ${item.bag_size}`);
  if (item.bag_texture) parts.push(`Bag texture: ${item.bag_texture}`);
  if (item.bag_metal_finish && item.bag_metal_finish !== "none") parts.push(`Bag metal: ${item.bag_metal_finish}`);
  if (item.hat_texture) parts.push(`Hat texture: ${item.hat_texture}`);
  if (item.hat_silhouette) parts.push(`Hat silhouette: ${item.hat_silhouette}`);
  if (item.jewelry_scale) parts.push(`Jewelry scale: ${item.jewelry_scale}`);
  if (item.scarf_function) parts.push(`Scarf function: ${item.scarf_function}`);
  if (item.skirt_length) parts.push(`Skirt length: ${item.skirt_length}`);
  if (item.dress_silhouette) parts.push(`Silhouette: ${item.dress_silhouette}`);
  if (item.toe_shape) parts.push(`Toe: ${item.toe_shape}`);
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
  // rain_appropriate no longer surfaced to AI — material-intelligence covers it
  if (item.brand) parts.push(`Brand: ${item.brand}`);
  // Wear-frequency signal: lets the AI prefer under-rotated pieces
  // when choosing between comparable options.
  const wornCount = item.times_worn ?? 0;
  if (wornCount === 0) {
    parts.push("Never worn");
  } else {
    parts.push(`Worn ${wornCount}x`);
    if (item.last_worn_date) {
      const days = Math.floor(
        (Date.now() - new Date(item.last_worn_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      parts.push(`Last worn ${days}d ago`);
    }
  }

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

    // KV-backed medium-term memory of outfits we've SUGGESTED to this user.
    // The `recent_outfits` table tracks worn outfits; it wouldn't catch the
    // user mashing "Suggest" four times in five minutes and getting the
    // same three looks each time. We cap at 40 remembered sets with a 7d
    // TTL so the anti-repetition window covers a normal usage cadence
    // (few-times-per-week) without ossifying forever.
    const suggestionsKey = `recent-suggestions:${userId}`;
    const kvRecentSuggestions = (await kv
      .get<string[][]>(suggestionsKey)
      .catch(() => null)) ?? [];

    const [itemsRes, prefsRes, outfitsRes, recentRes] = await Promise.all([
      supabase.from("clothing_items").select("*").eq("is_stored", false),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      // Fetch up to 30 favorites (we sample a subset per call once the
      // pool is large enough — see sample-threshold logic below).
      supabase
        .from("outfits")
        .select("*")
        .eq("is_favorite", true)
        .order("created_at", { ascending: false })
        .limit(30),
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

    // Gender track — Track A (women + not-specified) uses the standard
    // styling logic. Track B (men) gets traditional men's silhouettes:
    // bag is optional, office bans shorts/sandals, masculine-coded tone.
    const gender: "woman" | "man" | "not-specified" =
      prefs?.gender === "man" ? "man" : prefs?.gender === "not-specified" ? "not-specified" : "woman";
    const isMensTrack = gender === "man";
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

    // Favorite-sampling rules to prevent aesthetic lock-in:
    //   - 0 to 3 favorites: skip the favorites block entirely (too small
    //     a sample to represent taste; one "I favorited the first look I
    //     saw" entry would anchor every future suggestion).
    //   - exactly 4: include all 4 (sampling would always drop one and
    //     give the AI an incomplete picture at this size).
    //   - 5 or more: randomly sample 3 per call, so the reference set
    //     varies between calls and every favorite eventually rotates in.
    const allFavorites = favoriteOutfits
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

    let favorites: typeof allFavorites;
    if (allFavorites.length < 4) {
      favorites = [];
    } else if (allFavorites.length === 4) {
      favorites = allFavorites;
    } else {
      // Fisher-Yates shuffle + take 3 so we sample a different subset
      // each call. Randomness happens on the server per request.
      const shuffled = [...allFavorites];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      favorites = shuffled.slice(0, 3);
    }

    const wardrobeList = items.map(describeItem).join("\n");

    const weatherDesc = weather
      ? `${weather.temp}°C, feels like ${weather.feels_like}°C. ${weather.condition}. Humidity: ${weather.humidity}%, wind: ${weather.wind_speed}km/h, rain chance: ${weather.precipitation_probability}%.`
      : "Weather data unavailable.";

    const moodInfo = MOOD_CONFIG[mood];
    const occasionLabel = OCCASION_LABELS[occasion];

    const favoritesSection = favorites.length > 0
      ? `\n\nUSER'S FAVORITE OUTFITS (learn from these - they represent the user's style preferences):\n${favorites.map((f, i) => `${i + 1}. ${f.items}${f.mood ? ` | Mood: ${f.mood}` : ""}${f.occasion ? ` | Occasion: ${f.occasion}` : ""}${f.weather_temp !== null ? ` | ${f.weather_temp}°C` : ""}${f.source === "manual" ? " (manually created)" : ""}`).join("\n")}`
      : "";

    // Anti-repetition signal: combine KV-tracked recent SUGGESTIONS (across
    // "Suggest" clicks in the last 12h) with worn looks from recent_outfits.
    // Together they stop the model from recycling the same 3 pairings.
    const allRecentSets: string[][] = [
      ...kvRecentSuggestions,
      ...recentItemSets.map((r) => r.item_ids),
    ];
    const recentSection = allRecentSets.length > 0
      ? `\n\nRECENTLY SHOWN OR WORN (item-id sets the user has already seen — your 3 outfits MUST each differ from every one of these by at least 2 items):\n${allRecentSets.map((ids, i) => `${i + 1}. [${ids.join(", ")}]`).join("\n")}`
      : "";

    const cachedPrefix = `You are Yav, a sharp personal stylist. Build outfits that are complete, weather-appropriate, and visually intentional — color story, proportion, one focal point.

WARDROBE:
${wardrobeList}${favoritesSection}${recentSection}`;

    // Variation nonce in the dynamic suffix only — keeps the cached prefix
    // hot while giving Claude a different starting context so we don't get
    // the same three outfits every call.
    const iterationNonce = `iter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Temperature-sensitivity preference: shifts the AI's perceived
    // weather so a "runs hot" person doesn't get a coat at 12°C and a
    // "runs cold" person isn't sent out in shirtsleeves at 18°C.
    // Qualitative ~3°C shift — meaningful enough to cross the prompt's
    // weather bands (cold <12°C / mild 12-22°C / warm >22°C).
    const sensitivity = prefs?.temperature_sensitivity ?? "normal";
    const sensitivityLine =
      sensitivity === "runs-hot"
        ? "USER PREFERENCE: runs HOT — treat the temperature as ~3°C warmer than reported. Skip outerwear unless temp is genuinely cold (<9°C). Avoid heavy knits/wool unless <12°C. Lean lighter."
        : sensitivity === "runs-cold"
        ? "USER PREFERENCE: runs COLD — treat the temperature as ~3°C cooler than reported. Require outerwear at <15°C (not <12°C). Layer earlier. Avoid sandals until >25°C. Lean warmer."
        : "";

    const dynamicSuffix = `

WEATHER: ${weatherDesc}
SEASON: ${currentSeason}
MOOD (apply Rule 13 — every outfit must visibly express this): ${moodInfo.label} — ${moodInfo.description}
OCCASION: ${occasionLabel}${styleWishes.length > 0 ? `\nSTYLE DIRECTION: ${styleWishes.join(", ")}` : ""}${anchorItemId ? `\nANCHOR ITEM: Every outfit MUST include item id [${anchorItemId}].` : ""}${sensitivityLine ? `\n${sensitivityLine}` : ""}
ITERATION: ${iterationNonce}

Return exactly 4 complete outfits from the wardrobe. They MUST be visibly different from each other (vary silhouette, color, or structure) AND different from every set in RECENTLY SHOWN OR WORN. (We display 3 to the user; the extra 1 is a backup in case one gets filtered out.)

HARD RULES — do not violate:
1. A dress or jumpsuit is STANDALONE on the body. Never combined with a "top" or "bottom" category item. Only outerwear can layer over. EXCEPTION: a dress with Silhouette = "slip" (satin slip / sleep-dress style) may be styled with a slim-fitted top underneath — but ONLY a top whose fit is "slim" or "regular" AND is NOT a layering piece, blazer, cardigan, hoodie, sweatshirt, or oversized item (e.g., a fitted t-shirt or thin turtleneck works; a hoodie or boxy tee does not).
2. Overalls are the one exception: they require a "top" underneath.
3. Every outfit needs a complete base: (a) a dress, (b) a jumpsuit, (c) overalls + top, or (d) top + bottom.
4. Max one item per subcategory across the whole outfit (no two belts, no two pairs of shoes).
5. WEATHER (NON-NEGOTIABLE):
   - Cold (<12°C): the outfit MUST include an item whose category is literally "outerwear" in the wardrobe list (look at the parenthesized category on each [id] line — e.g. "(outerwear/jacket)"). Sweaters, cardigans, and hoodies belong to "top" NOT "outerwear" — they DO NOT satisfy this rule. If the wardrobe has zero outerwear items, skip the rule.
   - Cold base layer: the dress / jumpsuit / top+bottom under the coat must ALSO handle the temperature — the coat comes off indoors. At <10°C, base Warmth ≥2; at <5°C, Warmth ≥2.5. Prefer midi/maxi, knit/wool, fall or winter in Seasons.
   - Warm (>22°C): no heavy coats, no wool, no heavy boots.
   - RAIN (rain% ≥ 40% OR Condition contains "rain" / "showers"): apply automated Material-Intelligence filters to element-facing layers (Outerwear, Shoes, Bag):
     · BLOCK Material in [suede, silk, satin, canvas] for these categories — non-rain-proof.
     · PREFER Material in [leather, faux-leather, patent-leather, nylon, rubber, polyester, faux-suede].
     · For outdoor / travel occasions: also block Toe shape "open-toe" / "peep-toe" AND Heel type "high-heel" (impractical in rain).
     · INDOOR PROTECTION EXCEPTION: the base outfit (top / bottom / dress) is exempt from the material blacklist — silk dress is fine indoors. BUT if the base layer is non-rain-proof (silk / satin / suede) for an evening occasion (date / dinner-out / party), the chosen outerwear MUST be rain-proof (leather / nylon / polyester / rubber / faux-leather) AND length ≥ "regular" (not cropped) — long enough to protect the base when walking in.
6. SHOES: every outfit EXCEPT occasion = at-home MUST include a "shoes" category item. No exceptions.
7. AT-HOME: no bag. Scarves only if Warmth ≤2 (thin bandana / silk kerchief). Never pair a turtleneck top with any scarf at home.
8. EVENING COCKTAIL: for date / dinner-out / party, bias toward dressy materials (silk, satin, chiffon, lace, velvet, sequined) and mini-to-midi dress length when a dress-based look fits.
9. OFFICE: for work, the classic template is (a) a dress with Silhouette "sheath" + blazer + pump (low/mid heel), or (b) tailored trousers + blouse + pump. Prefer sheath silhouette when picking a dress for work; avoid "bodycon" / "slip" / "mermaid" for the office. No denim bottoms. No athletic sneakers. If the wardrobe lacks the ideal staple, still propose the best available outfit AND name the missing piece in styling_tip ("A pointed-toe pump would finish this", "A structured blazer would sharpen it").
10. SHOE × OCCASION: work → pump / slingback (low-to-mid heel); brunch / date / creative-office → kitten heel or ballet flat; party / formal → strappy sandal or heeled sandal; cocktail does NOT strictly require a heel — a dressy flat can work.
11. BAG, HAT, ACCESSORY:
    BAG: ${isMensTrack ? "OPTIONAL for all occasions on the men's track — most men's looks don't require a bag. Only include a bag if the wardrobe has one that genuinely fits the look (laptop bag for work, weekender for travel)." : "REQUIRED for every occasion EXCEPT at-home and sport."} Pick at most one bag from the wardrobe (category="bag"). If the wardrobe has zero bags, skip silently.
    BAG SIZE × OCCASION (Track A): formal / party / date → MUST be "clutch" or "small"; work → "medium" or "large" (no clutch); casual / travel / brunch / hangout / outdoor → "tote" or "large" is fine; dinner-out → "small" or "medium".
    BAG TEXTURE × OCCASION: for formal / date / party, BLOCK Material in [canvas, nylon] AND BLOCK Bag texture in [woven, fringed] — these read too casual for dressed-up occasions.
    HAT × OCCASION: a hat (accessory/hat) is welcome for casual / brunch / hangout / sport / outdoor / travel / dinner-out / date / party — but NEVER for at-home, work, or formal events.
    HAT SILHOUETTE × OCCASION (when Hat silhouette field is set): formal / date / dinner-out → BLOCK silhouette in [baseball, trucker, bucket] (too casual). Allow [fedora, beret, pillbox, headband]. For Velvet or Felt hat texture at formal / party, restrict to silhouette in [beret, pillbox, headband] only — no velvet trucker caps.
    ACCESSORY MINIMUM: for every occasion EXCEPT at-home and sport (and waived on the men's track when no fitting accessory exists), include AT LEAST ONE accessory beyond the bag (belt, scarf, hat, jewelry, sunglasses, watch). Pick something that fits the outfit (no sunglasses indoors at night, no warm scarf on a 25°C day).
    JEWELRY SCALE (when Jewelry scale field is set): when a hat is in the outfit AND any visible jewelry has scale="statement", drop the statement jewelry — too much focal energy in the head/neck zone. Minimal jewelry pairs cleanly with a hat.
    SCARF FUNCTION (when Scarf function field is set): a scarf with function="functional" is a warmth layer (Slot 3) and does NOT count toward the head/neck proximity rule (Rule 15). A scarf with function="decorative" DOES count and competes with a hat for the same focal slot.${isMensTrack ? "\n    MEN'S OFFICE GUARDRAIL: at occasion=work, BLOCK shorts and open-toe shoes (sandals). Strongly prefer Subcategory in [trousers, jeans] paired with a Shirt (collared) and proper closed-toe shoes (loafers, oxfords, derbies). NEVER suggest a tank-top or sweatpants for work." : ""}
    ${isMensTrack ? "MEN'S METAL SYNC FOCUS: prioritize matching Metal finish on the watch, belt buckle, and shoe hardware/eyelets — those are the visible hardware points on a men's look. Bag and jewelry hardware are secondary on this track." : ""}
    SKIRT × OCCASION (Track A only, when Skirt length field is set): work → BLOCK skirt_length="mini" (too casual / unprofessional). Knee-length, midi, or maxi only. Date / dinner-out / party → all lengths allowed, prefer mini or midi for the focal silhouette.
    SKIRT × BALANCE (Track A only): when an outfit pairs a skirt_length="mini" with a TOP, prioritize a top with neckline in [turtleneck, mock-neck, halter, one-shoulder] OR sleeve_length="long" — proportional balance (less leg, more coverage up top). Footwear: when skirt is mini, prioritize Shoe height in [knee, over-knee] for an intentional silhouette.
    SKIRT × COLD WEATHER: do NOT block mini skirts in the cold — assume the user wears tights underneath. But prioritize mini skirts with Material in [wool, leather, tweed] for a winter-appropriate texture.
12. STYLE DIRECTION (when present):
   a) ITEM ANCHOR: if STYLE DIRECTION names a specific wardrobe piece — possessive form ("with my black blazer", "wear my red dress", "use my white sneakers") OR a color + category phrase that points to a real item ("the leather jacket", "the green skirt") — find the closest matching item in the wardrobe by name/color/category. Treat that item as an ANCHOR: every outfit MUST include it. If the wardrobe has no matching piece, ignore that specific phrase (don't invent).
   b) HARD-ENFORCED PRESETS — treat these as non-negotiable when present anywhere in STYLE DIRECTION (English or French, case-insensitive):
      - "all black" / "tout en noir" / "all-black": EVERY visible item in the outfit must be black or near-black (charcoal, jet, ink). No denim, no beige, no white sneakers, no pastels. If you can't build a complete all-black outfit from the wardrobe, skip this outfit slot rather than break the rule.
      - "mix patterns" / "mixer les motifs" / "mix-patterns": at least 2 items in the outfit must have a non-solid pattern (striped, plaid, floral, animal-print, etc.). Solid pieces are fine as the third/fourth.
      - "dress day" / "journée robe" / "dress-day": the outfit must be built around a dress (category="dress"). Exception: if the wardrobe has zero dresses, fall back gracefully.
   c) SOFT VIBE: any other phrase ("more drapey", "less colorful", "office chic", custom user text) is a hint — bias the outfits toward it but no hard requirement.
13. MOOD (must be visibly expressed in EVERY outfit — different moods + same occasion MUST produce visibly different outfits):
   - Energized → at least one saturated bright (red, orange, yellow, fuchsia, electric blue, kelly green). No all-neutral palette.
   - Confident → tailored / structured silhouette (blazer, sheath, sharp lines). Polished, intentional. No slouchy proportions. Bag should be Bag size "medium" with Bag texture "smooth" / "pebbled" / "croc-embossed" / "snake-embossed" (rigid, structured). All visible Metal finish must match (see Rule 14).
   - Playful → unexpected pairing or one whimsical element: print mix, color block, statement accessory, contrast color. Not a safe monochrome. Mixed Metal finish is ALLOWED (only mood where it is). High-low pairings welcome (a casual hat with a blazer, etc.).
   - Cozy → soft textures (knit, cashmere, fleece, jersey, wool). Warm earth tones (camel, cream, oatmeal, rust, chocolate). Relaxed not slouchy.
   - Chill → relaxed easy silhouette, neutral palette, minimal jewelry. Elevated t-shirt-and-jeans energy.
   - Bold → at least one statement piece: bright saturated color OR distinctive pattern (animal, plaid, embellished) OR dramatic silhouette (oversized blazer, mini, leather). No safe choices.
   - Comfort Day → elastic / drawstring / pull-on bottoms preferred. Soft top (knit, jersey, oversized). NEVER heels. NEVER tailored / fitted / structured. Easy on the body.
   - Need a Hug → soft pastels OR oversized cozy pieces. Comfort with one warm/uplifting touch. No edgy / hard / dark. Prioritize Material in [cashmere, wool, fleece, knit]. AVOID Toe shape "pointed" (too sharp). Bag texture should be soft (woven / fringed / pebbled), NOT rigid (smooth / croc-embossed).
14. METAL SYNC: all visible hardware Metal finish (and Bag metal finish for the bag) across shoes / belt / jewelry / watch / bag MUST match — gold-with-gold, silver-with-silver, etc. Items tagged "none" or "mixed" are neutral and pair with anything. EXCEPTION: when MOOD = Playful, mixed metals are explicitly allowed (only mood where this is true).${isMensTrack ? " On the men's track, focus the sync on watch + belt buckle + shoe hardware — the bag is secondary." : ""}
15. PROXIMITY (head/neck zone — anti-clutter): at most ONE focal item in the head-and-neck zone per outfit. If the outfit has a hat, do NOT also include a scarf — UNLESS temperature is below 5°C, where the scarf becomes a functional warmth layer and is exempt from this rule. (When temp ≥ 5°C, a scarf is decorative and competes for the same focal slot as the hat.)
16. TEXTURE CONTRAST (visual depth — soft preference): when the base outfit (top + bottom OR dress) is entirely Material in [cotton, denim, jersey, knit] AND every visible item has Pattern "solid", PREFER selecting a bag with Bag texture in [quilted, croc-embossed, snake-embossed, pebbled, woven] over a smooth one. Soft preference, not a hard rule.

STYLING INTENT: One focal point. Mix textures — ideally pair one fitted piece with one looser piece. Use outerwear as a finisher when it fits the weather and occasion. Lean into the user's favorites for preferences but bring at least one fresh angle.

ROTATION: Keep the wardrobe moving. Each item shows a wear-frequency signal ("Never worn", "Worn 3x", "Last worn 21d ago"). When choosing between two comparable options that both fit the rules above, prefer the LESS-WORN one. Across 4 outfits, deliberately include at least 2 pieces that are "Never worn" or haven't been worn in 30+ days IF the wardrobe has any — don't default to the same anchor items every call.

Wardrobe gap: before suggesting one, count what the user ALREADY has per category. Don't suggest outerwear if they have any jackets; don't suggest a dress if they have dresses. Set to null when the wardrobe is covered.

Call the propose_outfits tool with exactly 4 outfits. Per outfit:
- item_ids: 3-6 item IDs from the WARDROBE (use [id] values verbatim).
- name: Short 2-4 word look name in ${languageName}.
- reasoning: ONE short editorial sentence in ${languageName}. Cite ONE specific styling principle at play — color harmony (warm/cool contrast, monochrome, analogous), silhouette balance (${isMensTrack ? "structured + relaxed" : "fitted + loose, long + cropped"}), texture play (smooth + nubby, matte + sheen), or occasion fit. Refer to pieces by broad category only (the dress, the bottoms, the jacket, the shoes, the belt). Write like ${isMensTrack ? "GQ" : "Vogue"} — ${isMensTrack ? "use masculine-coded language: \"sharp\", \"crisp\", \"clean line\", \"intentional\", \"grounded\". Avoid \"chic\", \"feminine\", \"flowy\"." : "use editorial fashion language."} Skip filler like "perfect for" or "this outfit works because".
- styling_tip: ONE short sentence in ${languageName} with a concrete styling ACTION (tuck, half-tuck, cuff, roll sleeves, layer open, cinch, push sleeves, knot hem, pop collar). If the outfit is best-effort because the wardrobe lacks the ideal staple called for by rules 8-11, use this field to name the gap. null if nothing useful fits.

wardrobe_gap: One short sentence about a missing staple, or null if the wardrobe is covered.`;

    // Use Anthropic's tool_use with a JSON schema instead of asking for raw
    // JSON in a text response. Free-form JSON was failing to parse ~30% of
    // the time because the AI slipped unescaped quotes / dashes into the
    // reasoning and styling_tip strings; tool_use returns structured data
    // already validated against the schema so parse errors can't happen.
    type ParsedShape = {
      outfits?: {
        item_ids: string[];
        name?: string;
        reasoning?: string | null;
        styling_tip?: string | null;
      }[];
      wardrobe_gap?: string | null;
    };
    async function callAi(): Promise<{ parsed: ParsedShape | null; stopReason: string | null }> {
      // Gemini 3 Flash with thinking disabled (thinkingBudget: 0) and
      // structured output. Same JSON shape Anthropic's tool_use returned,
      // so the rest of the pipeline doesn't change. ~5s end-to-end on
      // this rules-heavy prompt vs ~26s with default thinking.
      const result = await withGeminiRetry(
        () =>
          genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `${cachedPrefix}\n\n${dynamicSuffix}`,
            config: {
              temperature: 1,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              responseSchema: SUGGEST_RESPONSE_SCHEMA,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        { tag: "suggest" }
      );
      const stopReason = result.candidates?.[0]?.finishReason ?? null;
      const text = result.text;
      if (!text) {
        return { parsed: null, stopReason: stopReason ?? null };
      }
      try {
        return { parsed: JSON.parse(text) as ParsedShape, stopReason: stopReason ?? null };
      } catch (err) {
        console.error("[suggest] Failed to parse Gemini JSON:", err, text.slice(0, 200));
        return { parsed: null, stopReason: stopReason ?? null };
      }
    }

    // Single attempt — Sonnet's bad-shape rate is <1% with structured
    // tool_use, so the second retry mostly just doubled tail latency.
    // If the rare bad shape comes back, surface it; the UI shows a
    // "try again" button.
    const r = await callAi();
    const parsed = r.parsed;
    if (!parsed || !Array.isArray(parsed.outfits)) {
      console.error(
        `[suggest] AI returned unexpected shape; stop=${r.stopReason}`,
        parsed
      );
      return NextResponse.json({
        suggestions: [],
        message: `AI returned an unexpected shape — stop=${r.stopReason}`,
      });
    }
    const parsedOutfits = parsed.outfits;

    // Strip material / color / brand words from an AI-written name. The
    // AI sometimes writes "Suede & Satin Edge" when there's no suede in
    // the outfit; rather than drop the outfit, just scrub those words
    // from the name and fall back to a generic label if nothing's left.
    const NAME_STRIP_WORDS = /\b(?:suede|satin|silk|leather|denim|wool|cotton|linen|knit|mesh|lace|velvet|corduroy|faux(?:-|\s)leather|faux(?:-|\s)suede|patent(?:-|\s)leather|moto|biker|bomber|maxi|midi|mini|crop|cropped|flared|skinny|slim|oversized|tapered|bootcut|wide(?:-|\s)leg)s?\b/gi;
    const cleanName = (raw: string | undefined, fallback: string): string => {
      if (!raw) return fallback;
      const cleaned = raw
        .replace(NAME_STRIP_WORDS, "")
        .replace(/\s+/g, " ")
        .replace(/\s*([&+,])\s*/g, " $1 ")
        .replace(/^\s*[&+,]+\s*|\s*[&+,]+\s*$/g, "")
        .trim();
      return cleaned.length >= 3 ? cleaned : fallback;
    };

    const mapped = parsedOutfits.map((s) => {
      const rawItems = s.item_ids
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as ClothingItem[];

      // Auto-fix fixable structural violations instead of dropping outfits.
      // The AI routinely breaks the "dress + top/bottom" and "max one per
      // subcategory" rules despite the prompt; dropping those outfits was
      // starving the UI (sometimes 0 outfits reached the user). Silent
      // strip keeps the outfit alive; the hybrid text validator still
      // swaps in template prose when the AI's description references
      // stripped items.
      const rawHasDress = rawItems.some((i) => i.category === "dress");
      const rawHasJumpsuit = rawItems.some(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      const rawHasOnePiece = rawItems.some((i) => i.category === "one-piece");
      const fixes: string[] = [];

      let stripped = rawItems;
      // Strip bottoms when a dress or one-piece is present.
      if ((rawHasDress || rawHasOnePiece) && stripped.some((i) => i.category === "bottom")) {
        stripped = stripped.filter((i) => i.category !== "bottom");
        fixes.push("stripped bottom (dress/jumpsuit present)");
      }
      // Strip non-layering tops when a dress or non-overalls jumpsuit is
      // present. EXCEPTION: a slip-silhouette dress can be styled with a
      // slim/regular fitted top underneath — keep those.
      const rawSlipDress = rawItems.some(
        (i) => i.category === "dress" && i.dress_silhouette === "slip"
      );
      const isAllowedUnderSlip = (i: ClothingItem) =>
        i.category === "top" &&
        !i.is_layering_piece &&
        i.subcategory !== "cardigan" &&
        i.subcategory !== "hoodie" &&
        i.subcategory !== "sweater" &&
        (i.fit === "slim" || i.fit === "regular");
      if ((rawHasDress || rawHasJumpsuit) && stripped.some(
        (i) => i.category === "top" && !i.is_layering_piece && i.subcategory !== "cardigan"
        && !(rawSlipDress && isAllowedUnderSlip(i))
      )) {
        stripped = stripped.filter(
          (i) =>
            i.category !== "top" ||
            i.is_layering_piece ||
            i.subcategory === "cardigan" ||
            (rawSlipDress && isAllowedUnderSlip(i))
        );
        fixes.push("stripped non-layering top (dress/jumpsuit present)");
      }
      // Dedupe subcategories — keep first of each.
      {
        const seen = new Set<string>();
        const deduped: ClothingItem[] = [];
        for (const i of stripped) {
          if (i.subcategory && seen.has(i.subcategory)) continue;
          if (i.subcategory) seen.add(i.subcategory);
          deduped.push(i);
        }
        if (deduped.length !== stripped.length) {
          fixes.push("deduped subcategories");
        }
        stripped = deduped;
      }
      // Single-piece categories: shoes / bag / bottom / dress / one-piece
      // — keep at most one item from each. The subcategory dedupe above
      // misses the "one pair of sneakers + one pair of boots" case
      // (different subcategories, both shoes — still wrong).
      {
        const SINGLE_PIECE = new Set<string>(["shoes", "bag", "bottom", "dress", "one-piece"]);
        const seenCat = new Set<string>();
        const dedupedByCat: ClothingItem[] = [];
        for (const i of stripped) {
          if (SINGLE_PIECE.has(i.category) && seenCat.has(i.category)) continue;
          if (SINGLE_PIECE.has(i.category)) seenCat.add(i.category);
          dedupedByCat.push(i);
        }
        if (dedupedByCat.length !== stripped.length) {
          fixes.push("deduped single-piece categories");
        }
        stripped = dedupedByCat;
      }

      // At-home scarf stripping. The AI sometimes fixates on one warm scarf
      // and sticks it into every outfit, which previously caused the
      // at-home filter to nuke the whole batch. Strip-instead-of-drop:
      //   - Remove any warm scarf (warmth >= 3) from at-home outfits.
      //   - Remove any scarf if the outfit also has a turtleneck top
      //     (neck is already covered — redundant styling).
      if (occasion === "at-home") {
        const hasTurtleneck = stripped.some(
          (i) => i.category === "top" && i.neckline === "turtleneck"
        );
        const beforeLen = stripped.length;
        stripped = stripped.filter((i) => {
          if (i.category !== "accessory" || i.subcategory !== "scarf") return true;
          if ((i.warmth_rating ?? 0) >= 3) return false;
          if (hasTurtleneck) return false;
          return true;
        });
        if (stripped.length !== beforeLen) {
          fixes.push("stripped scarf (at-home rule)");
        }
      }

      // Auto-inject an outerwear piece when the outfit is cold but missing
      // one. Pick closest-warmth-match; bias the fit so we don't layer a
      // slim jacket over an oversized sweater (the proportion is off and
      // physically the sweater bunches under the jacket).
      if (
        weather &&
        typeof weather.temp === "number" &&
        weather.temp < 12 &&
        !stripped.some((i) => i.category === "outerwear")
      ) {
        const available = items.filter(
          (i) => i.category === "outerwear" && !i.is_stored
        );
        if (available.length > 0) {
          const targetWarmth =
            weather.temp < 5 ? 4.5 : weather.temp < 10 ? 3.5 : 2.5;
          // If the base top is oversized / loose, the outerwear must NOT
          // be slim or fitted — a slim jacket won't close over it and the
          // silhouette reads wrong.
          const baseTopFit = stripped.find(
            (i) => i.category === "top" && !i.is_layering_piece
          )?.fit;
          const needsLoose =
            baseTopFit === "oversized" || baseTopFit === "loose";
          const fitCompatible = (o: ClothingItem) => {
            if (!needsLoose) return true;
            return o.fit !== "slim";
          };
          const preferred = available.filter(fitCompatible);
          const pool = preferred.length > 0 ? preferred : available;
          let best = pool[0];
          let bestDist = Math.abs((best.warmth_rating ?? 3) - targetWarmth);
          for (const o of pool.slice(1)) {
            const d = Math.abs((o.warmth_rating ?? 3) - targetWarmth);
            if (d < bestDist) {
              best = o;
              bestDist = d;
            }
          }
          const alreadySub = stripped.some(
            (i) => i.subcategory && i.subcategory === best.subcategory
          );
          if (!alreadySub) {
            stripped = [...stripped, best];
            fixes.push(`injected outerwear: ${best.subcategory ?? "jacket"}`);
          }
        }
      }

      // Auto-inject shoes when the outfit is non-at-home but missing them
      // and the wardrobe has shoes available. The AI skips shoes about as
      // often as it skips jackets. Match the current occasion's vibe via
      // the shoe's occasions array; fall back to any shoe.
      if (
        occasion !== "at-home" &&
        !stripped.some((i) => i.category === "shoes")
      ) {
        const availableShoes = items.filter(
          (i) => i.category === "shoes" && !i.is_stored
        );
        if (availableShoes.length > 0) {
          const occasionMatches = availableShoes.filter((s) =>
            Array.isArray(s.occasions) && s.occasions.includes(occasion as Occasion)
          );
          const best = occasionMatches[0] ?? availableShoes[0];
          stripped = [...stripped, best];
          fixes.push(`injected shoes: ${best.subcategory ?? "shoes"}`);
        }
      }

      // Auto-inject a bag for every occasion except at-home and sport
      // (matches Rule 11). Same fallback pattern as shoes — prefer one
      // whose occasions array matches the current occasion, otherwise
      // grab any non-stored bag. Skips silently if the wardrobe has
      // no bags at all (Rule 11 explicitly allows that).
      if (
        occasion !== "at-home" &&
        occasion !== "sport" &&
        !stripped.some((i) => i.category === "bag")
      ) {
        const availableBags = items.filter(
          (i) => i.category === "bag" && !i.is_stored
        );
        if (availableBags.length > 0) {
          const occasionMatches = availableBags.filter((b) =>
            Array.isArray(b.occasions) && b.occasions.includes(occasion as Occasion)
          );
          const best = occasionMatches[0] ?? availableBags[0];
          stripped = [...stripped, best];
          fixes.push(`injected bag: ${best.subcategory ?? "bag"}`);
        }
      }

      // Auto-inject one accessory beyond the bag for every occasion
      // except at-home and sport (matches the new ACCESSORY MINIMUM
      // rule). Skip hat at work (Rule 11 hat × occasion). Pick the
      // first wardrobe accessory whose occasions array matches; if
      // nothing matches the occasion, skip silently — the rule
      // explicitly says "skip if nothing in the wardrobe makes sense".
      if (
        occasion !== "at-home" &&
        occasion !== "sport" &&
        !stripped.some((i) => i.category === "accessory")
      ) {
        const availableAccessories = items.filter((i) => {
          if (i.category !== "accessory" || i.is_stored) return false;
          // Hat is forbidden at work per Rule 11.
          if (occasion === "work" && i.subcategory === "hat") return false;
          // Sunglasses indoors at night is silly — skip if the occasion
          // is indoor-evening.
          if (
            i.subcategory === "sunglasses" &&
            (occasion === "dinner-out" || occasion === "party" || occasion === "formal")
          ) {
            return false;
          }
          return true;
        });
        if (availableAccessories.length > 0) {
          const occasionMatches = availableAccessories.filter((a) =>
            Array.isArray(a.occasions) && a.occasions.includes(occasion as Occasion)
          );
          const pool = occasionMatches.length > 0 ? occasionMatches : availableAccessories;
          const best = pool[0];
          stripped = [...stripped, best];
          fixes.push(`injected accessory: ${best.subcategory ?? "accessory"}`);
        }
      }

// Apply the canonical display order so every consumer of this
      // suggestion sees items head-to-toe (top, bottom, outerwear,
      // shoes, bag, accessories).
      const outfitItems = orderOutfitItems(stripped);

      // Hybrid text: prefer the AI's one-sentence prose; fall back to the
      // server template ONLY when the AI slips a hallucinated category
      // word into the text (the "moto jacket" bug). Keeps creative voice
      // where it's safe, guarantees consistency where it isn't.
      const aiReasoning = oneSentence(s.reasoning);
      const aiTip = oneSentence(s.styling_tip);
      const reasoning =
        aiReasoning && textIsConsistent(outfitItems, aiReasoning)
          ? aiReasoning
          : buildReasoning(outfitItems, mood, occasion, weather, locale);
      let styling_tip: string | null =
        aiTip && textIsConsistent(outfitItems, aiTip)
          ? aiTip
          : buildStylingTip(outfitItems, locale);

      // Tights nudge: when it's cold and the outfit has an exposed-leg
      // piece (mini/midi dress, skirt, shorts), append a reminder to
      // layer opaque tights. Skips if the dress is a maxi (legs already
      // covered) or the outfit is at-home.
      if (
        weather &&
        typeof weather.temp === "number" &&
        weather.temp < 12 &&
        occasion !== "at-home"
      ) {
        const hasExposedLegPiece = outfitItems.some((i) => {
          if (i.category === "dress") return i.subcategory !== "maxi-dress";
          if (i.category === "bottom") {
            return i.subcategory === "skirt" || i.subcategory === "shorts";
          }
          return false;
        });
        if (hasExposedLegPiece) {
          const tightsTip =
            locale === "fr"
              ? "Ajoute des collants opaques pour tenir le froid."
              : "Layer opaque tights underneath for warmth.";
          styling_tip = styling_tip ? `${styling_tip} ${tightsTip}` : tightsTip;
        }
      }

      const nameFallback = `${moodInfo.label} look`;
      const name = cleanName(s.name, nameFallback);

      return {
        items: outfitItems,
        score: 1,
        reasoning,
        styling_tip,
        color_harmony: "ai-styled",
        mood_match: mood,
        name,
        weather_temp: weather?.temp ?? null,
        weather_condition: weather?.condition ?? null,
        _fixes: fixes,
        _ids: outfitItems.map((i) => i.id),
      };
    });

    // Wardrobe-availability flags used by the post-parse filters. If the
    // user's wardrobe doesn't have any outerwear, we can't demand a
    // jacket for cold weather; same for shoes. Best-effort is better than
    // no suggestions.
    const wardrobeHasOuterwear = items.some((i) => i.category === "outerwear");
    const wardrobeHasShoes = items.some((i) => i.category === "shoes");

    // Compute the "base layer" warmth — the warmth of what sits directly
    // against the skin. For cold weather this matters more than the
    // outerwear's warmth: a warmth-1 mini floral dress under a warmth-5
    // coat is still wrong, because the dress itself can't handle the
    // temperature when the coat comes off indoors.
    const baseWarmth = (outfit: ClothingItem[]): number => {
      const dress = outfit.find((i) => i.category === "dress");
      if (dress) return dress.warmth_rating ?? 3;
      const jumpsuit = outfit.find(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      if (jumpsuit) return jumpsuit.warmth_rating ?? 3;
      const warmths: number[] = [];
      const overalls = outfit.find(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (overalls) warmths.push(overalls.warmth_rating ?? 3);
      const top = outfit.find((i) => i.category === "top");
      const bottom = outfit.find((i) => i.category === "bottom");
      if (top) warmths.push(top.warmth_rating ?? 3);
      if (bottom) warmths.push(bottom.warmth_rating ?? 3);
      return warmths.length > 0 ? Math.min(...warmths) : 3;
    };

    // Rigid drops (truly broken outfits) vs soft drops (quality issues —
    // base-layer warmth mismatch). If hard drops leave us with fewer than
    // 3, we admit soft-dropped outfits back with a styling tip explaining
    // the gap. Cold-without-outerwear is now handled upstream via auto-
    // injection in the map phase.
    const drops: { ids: string[]; reason: string }[] = [];
    const softMismatch: typeof mapped = [];

    // Detect preset wishes from the user's STYLE DIRECTION text. Claude
    // is told these are hard rules but doesn't always honor them — we
    // enforce post-parse so non-compliant outfits get dropped.
    const wishText = styleWishes.join(" ").toLowerCase();
    const wantsAllBlack = /all[ -]?black|tout en noir/i.test(wishText);
    const wantsDressDay = /dress[ -]?day|journ[ée]e robe/i.test(wishText);
    const wantsMixPatterns = /mix[ -]?patterns?|mixer les motifs/i.test(wishText);

    // Hex-based "is this item dark/near-black?" check. Accepts items
    // whose primary color is named black/jet/onyx/charcoal OR whose
    // hex sum is below ~90 (avg <30 per channel — true black-to-charcoal
    // band, excludes navy and dark brown which read as colors).
    function isDarkItem(item: { colors: { hex: string; name: string }[] }): boolean {
      const primary = item.colors?.[0];
      if (!primary) return false;
      const name = (primary.name ?? "").toLowerCase();
      if (/black|jet|onyx|noir|ebony|obsidian|raven/.test(name)) return true;
      const m = /^#?([0-9a-f]{6})$/i.exec((primary.hex ?? "").trim());
      if (!m) return false;
      const n = parseInt(m[1], 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return r + g + b < 90;
    }

    const hardValid = mapped.filter((s) => {
      // Shoes required for every occasion except at-home (if wardrobe has shoes).
      if (occasion !== "at-home" && wardrobeHasShoes) {
        const hasShoes = s.items.some((i) => i.category === "shoes");
        if (!hasShoes) {
          drops.push({ ids: s._ids, reason: "missing shoes" });
          return false;
        }
      }
      // Preset enforcement — Claude says it follows these but the AI is
      // unreliable. Drop any outfit that breaks a hard preset rule.
      if (wantsAllBlack) {
        const offender = s.items.find((i) => !isDarkItem(i));
        if (offender) {
          drops.push({
            ids: s._ids,
            reason: `all-black: "${offender.name}" primary color "${offender.colors?.[0]?.name}" not dark`,
          });
          return false;
        }
      }
      if (wantsDressDay) {
        const hasDress = s.items.some((i) => i.category === "dress");
        if (!hasDress) {
          drops.push({ ids: s._ids, reason: "dress-day preset but no dress" });
          return false;
        }
      }
      if (wantsMixPatterns) {
        const nonSolidCount = s.items.filter((i) => {
          const patterns = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
          return patterns.some((p) => p && p !== "solid");
        }).length;
        if (nonSolidCount < 2) {
          drops.push({
            ids: s._ids,
            reason: `mix-patterns: only ${nonSolidCount} non-solid item(s)`,
          });
          return false;
        }
      }
      // Hat formality block — no hats at work or formal events.
      if (occasion === "work" || occasion === "formal") {
        const hat = s.items.find(
          (i) => i.category === "accessory" && i.subcategory === "hat"
        );
        if (hat) {
          drops.push({ ids: s._ids, reason: `hat not allowed at ${occasion}` });
          return false;
        }
      }
      // Hat silhouette × occasion — for formal/date/dinner-out, block
      // baseball/trucker/bucket caps. For velvet/felt at formal/party,
      // restrict to beret/pillbox/headband only.
      if (occasion === "formal" || occasion === "date" || occasion === "dinner-out") {
        const casualHat = s.items.find(
          (i) =>
            i.category === "accessory" &&
            i.subcategory === "hat" &&
            (i.hat_silhouette === "baseball" ||
              i.hat_silhouette === "trucker" ||
              i.hat_silhouette === "bucket")
        );
        if (casualHat) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: hat silhouette "${casualHat.hat_silhouette}" too casual`,
          });
          return false;
        }
      }
      if (occasion === "formal" || occasion === "party") {
        const dressyTextureWrongShape = s.items.find((i) => {
          if (i.category !== "accessory" || i.subcategory !== "hat") return false;
          if (i.hat_texture !== "velvet" && i.hat_texture !== "felt") return false;
          if (i.hat_silhouette === "beret" || i.hat_silhouette === "pillbox" || i.hat_silhouette === "headband") return false;
          // Velvet/felt with no silhouette set is acceptable; only block when both are known and silhouette is wrong.
          if (!i.hat_silhouette) return false;
          return true;
        });
        if (dressyTextureWrongShape) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: ${dressyTextureWrongShape.hat_texture} hat must be beret/pillbox/headband`,
          });
          return false;
        }
      }
      // Men's track: office guardrail — no shorts, no open-toe shoes.
      if (gender === "man" && occasion === "work") {
        const shorts = s.items.find(
          (i) => i.category === "bottom" && i.subcategory === "shorts"
        );
        if (shorts) {
          drops.push({ ids: s._ids, reason: "men's office: shorts not allowed at work" });
          return false;
        }
        const openToe = s.items.find(
          (i) =>
            i.category === "shoes" &&
            (i.toe_shape === "open-toe" || i.toe_shape === "peep-toe" || i.subcategory === "sandals")
        );
        if (openToe) {
          drops.push({ ids: s._ids, reason: "men's office: open-toe / sandals not allowed at work" });
          return false;
        }
      }
      // Skirt length × occasion (Track A only): no mini at work.
      if (gender !== "man" && occasion === "work") {
        const miniSkirt = s.items.find(
          (i) =>
            i.category === "bottom" &&
            i.subcategory === "skirt" &&
            i.skirt_length === "mini"
        );
        if (miniSkirt) {
          drops.push({
            ids: s._ids,
            reason: "work: mini skirt not professional",
          });
          return false;
        }
      }
      // Jewelry scale × hat proximity: a hat in the outfit + statement
      // jewelry = too much focal energy. Drop the outfit (let the AI
      // pick a different combo).
      {
        const hasHat = s.items.some(
          (i) => i.category === "accessory" && i.subcategory === "hat"
        );
        const statementJewelry = s.items.find(
          (i) =>
            i.category === "accessory" &&
            i.subcategory === "jewelry" &&
            i.jewelry_scale === "statement"
        );
        if (hasHat && statementJewelry) {
          drops.push({
            ids: s._ids,
            reason: "proximity: hat + statement jewelry compete for head/neck focal slot",
          });
          return false;
        }
      }
      // Bag formality — for formal/date/party, drop bags with casual
      // material (canvas/nylon) or casual texture (woven/fringed).
      if (occasion === "formal" || occasion === "date" || occasion === "party") {
        const bag = s.items.find((i) => i.category === "bag");
        if (bag) {
          const mats = Array.isArray(bag.material) ? bag.material : [bag.material];
          const casualMat = mats.some((m) => m === "canvas" || m === "nylon");
          const casualTex =
            bag.bag_texture === "woven" || bag.bag_texture === "fringed";
          if (casualMat || casualTex) {
            drops.push({
              ids: s._ids,
              reason: `bag too casual for ${occasion} (material=${mats.join(",")}, texture=${bag.bag_texture})`,
            });
            return false;
          }
        }
      }
      // Metal sync — all visible hardware must match. Skipped when mood
      // is Playful (the only mood that explicitly allows mixed metals).
      // On the men's track, the bag is excluded from the sync (men's
      // looks bias toward watch / belt / shoes for metal hardware).
      if (mood !== "playful") {
        const metalItems = s.items
          .map((i) => {
            // Bags use bag_metal_finish; everyone else uses metal_finish.
            const finish = i.category === "bag" ? i.bag_metal_finish : i.metal_finish;
            return { item: i, finish };
          })
          .filter(({ item, finish }) => {
            if (!finish || finish === "none" || finish === "mixed") return false;
            // Only count items where hardware is visible / styling-relevant.
            if (item.category === "shoes") return true;
            if (item.category === "bag" && gender !== "man") return true;
            if (item.category === "accessory" && (item.subcategory === "belt" || item.subcategory === "jewelry" || item.subcategory === "watch")) return true;
            return false;
          });
        if (metalItems.length >= 2) {
          const goldFamily = new Set(["gold", "rose-gold", "matte-gold", "brass", "bronze"]);
          const silverFamily = new Set(["silver", "chrome", "matte-silver", "gunmetal"]);
          const families = new Set(
            metalItems.map(({ finish }) =>
              goldFamily.has(finish ?? "") ? "gold" : silverFamily.has(finish ?? "") ? "silver" : "other"
            )
          );
          if (families.size > 1) {
            drops.push({
              ids: s._ids,
              reason: `metal mismatch: ${metalItems.map(({ item, finish }) => `${item.subcategory ?? item.category}=${finish}`).join(", ")}`,
            });
            return false;
          }
        }
      }
      // Proximity — head/neck zone. If the outfit has a hat AND a
      // decorative scarf, drop. A functional scarf (warmth layer) is
      // allowed regardless of temp (Slot 3 doesn't compete for the
      // focal slot). Falls back to temp heuristic if scarf_function
      // isn't set: <5°C the scarf is treated as functional.
      {
        const hasHat = s.items.some((i) => i.category === "accessory" && i.subcategory === "hat");
        const scarf = s.items.find((i) => i.category === "accessory" && i.subcategory === "scarf");
        const cold = typeof weather?.temp === "number" && weather.temp < 5;
        const scarfIsFunctional =
          scarf &&
          (scarf.scarf_function === "functional" ||
            (scarf.scarf_function == null && cold));
        if (hasHat && scarf && !scarfIsFunctional) {
          drops.push({
            ids: s._ids,
            reason: `proximity: hat + decorative scarf compete (function=${scarf.scarf_function ?? "unset"}, temp=${weather?.temp ?? "?"}°C)`,
          });
          return false;
        }
      }
      // RAIN material-intelligence — applies to element-facing layers
      // (outerwear, shoes, bag). Base outfit is exempt (handled by the
      // indoor-protection check below). When rain is triggered, drop
      // outfits whose outer-facing items use non-rain-proof materials.
      const rainTriggered =
        weather &&
        ((typeof weather.precipitation_probability === "number" &&
          weather.precipitation_probability >= 40) ||
          (typeof weather.condition === "string" &&
            /rain|shower/i.test(weather.condition)));
      if (rainTriggered) {
        const RAIN_BLOCK = new Set<string>(["suede", "silk", "satin", "canvas"]);
        const offenderOuter = s.items.find((i) => {
          if (
            i.category !== "outerwear" &&
            i.category !== "shoes" &&
            i.category !== "bag"
          )
            return false;
          const mats = Array.isArray(i.material) ? i.material : [i.material];
          return mats.some((m) => m && RAIN_BLOCK.has(m));
        });
        if (offenderOuter) {
          drops.push({
            ids: s._ids,
            reason: `rain-triggered: "${offenderOuter.name}" (${offenderOuter.category}) uses non-rain-proof material`,
          });
          return false;
        }
        // Outdoor / travel + rain → block open-toe / high-heel.
        if (occasion === "outdoor" || occasion === "travel") {
          const badShoe = s.items.find(
            (i) =>
              i.category === "shoes" &&
              (i.toe_shape === "open-toe" ||
                i.toe_shape === "peep-toe" ||
                i.heel_type === "high-heel")
          );
          if (badShoe) {
            drops.push({
              ids: s._ids,
              reason: `rain + ${occasion}: "${badShoe.name}" impractical (toe=${badShoe.toe_shape}, heel=${badShoe.heel_type})`,
            });
            return false;
          }
        }
        // Indoor protection — base layer in non-rain-proof material
        // (silk/satin/suede) at an evening occasion REQUIRES a rain-proof
        // outerwear with length >= "regular" (not cropped).
        const eveningEvent = occasion === "date" || occasion === "dinner-out" || occasion === "party";
        if (eveningEvent) {
          const baseDelicate = s.items.some((i) => {
            if (
              i.category !== "top" &&
              i.category !== "bottom" &&
              i.category !== "dress" &&
              i.category !== "one-piece"
            )
              return false;
            const mats = Array.isArray(i.material) ? i.material : [i.material];
            return mats.some((m) => m === "silk" || m === "satin" || m === "suede");
          });
          if (baseDelicate) {
            const RAIN_PROOF_OUTER = new Set<string>([
              "leather",
              "faux-leather",
              "patent-leather",
              "nylon",
              "polyester",
              "rubber",
            ]);
            const outer = s.items.find((i) => i.category === "outerwear");
            const outerOK =
              outer &&
              (() => {
                const mats = Array.isArray(outer.material) ? outer.material : [outer.material];
                const hasRainProofMat = mats.some((m) => m && RAIN_PROOF_OUTER.has(m));
                const longEnough = outer.length !== "cropped";
                return hasRainProofMat && longEnough;
              })();
            if (!outerOK) {
              drops.push({
                ids: s._ids,
                reason: `rain + evening: delicate base needs rain-proof, non-cropped outerwear`,
              });
              return false;
            }
          }
        }
      }
      // Mood: Need a Hug → no pointed-toe shoes (too sharp / clinical
      // for the comfort-and-soft-touch vibe).
      if (mood === "sad") {
        const sharpShoe = s.items.find(
          (i) => i.category === "shoes" && i.toe_shape === "pointed"
        );
        if (sharpShoe) {
          drops.push({
            ids: s._ids,
            reason: `Need-a-Hug + pointed-toe shoe ("${sharpShoe.name}")`,
          });
          return false;
        }
      }
      // (At-home scarf rules handled in the map phase via strip-instead-
      // of-drop; the filter doesn't need to re-check them here.)
      // Base completeness — this is structural, always enforced.
      const hasDress = s.items.some((i) => i.category === "dress");
      const hasOnePiece = s.items.some((i) => i.category === "one-piece");
      const hasTop = s.items.some((i) => i.category === "top");
      const hasBottom = s.items.some((i) => i.category === "bottom");
      const isOveralls = s.items.some(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (!hasDress && hasOnePiece) {
        if (isOveralls && !hasTop) {
          drops.push({ ids: s._ids, reason: "overalls without top" });
          return false;
        }
      } else if (!hasDress && !hasOnePiece) {
        if (!(hasTop && hasBottom)) {
          drops.push({ ids: s._ids, reason: "incomplete base" });
          return false;
        }
      }
      // (Cold-weather outerwear is handled by auto-injection in the map
      // phase — if an outfit reaches this filter without outerwear in
      // cold weather, the wardrobe genuinely doesn't have any to inject.)
      // Base-layer weather mismatch: SOFT drop. A mini summer dress (warmth
      // 1-1.5) under a winter coat is still wrong — the coat comes off,
      // the dress doesn't handle 5°C. Require base warmth >= 2 for temp
      // <10°C and >= 2.5 for temp <5°C. Soft-admit back if we'd end under 3.
      if (weather && typeof weather.temp === "number") {
        const baseW = baseWarmth(s.items);
        if (
          (weather.temp < 5 && baseW < 2.5) ||
          (weather.temp < 10 && baseW < 2)
        ) {
          softMismatch.push(s);
          return false;
        }
      }
      return true;
    });

    // Dedupe hard-valid outfits. Exact-set dedup first, then fuzzy:
    // two outfits sharing >=60% items (Jaccard index) are too similar —
    // drop the second so the user sees visually different looks.
    const seenSets = new Set<string>();
    const exactDeduped = hardValid.filter((s) => {
      const key = [...s._ids].sort().join("|");
      if (seenSets.has(key)) {
        drops.push({ ids: s._ids, reason: "duplicate of another outfit" });
        return false;
      }
      seenSets.add(key);
      return true;
    });
    const jaccard = (a: string[], b: string[]): number => {
      const setB = new Set(b);
      const intersection = a.filter((x) => setB.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union === 0 ? 0 : intersection / union;
    };
    const dedupedHard: typeof exactDeduped = [];
    for (const s of exactDeduped) {
      const tooSimilar = dedupedHard.some(
        (kept) => jaccard(kept._ids, s._ids) >= 0.6
      );
      if (tooSimilar) {
        drops.push({ ids: s._ids, reason: "too similar to another outfit" });
        continue;
      }
      dedupedHard.push(s);
    }

    // If hard-valid outfits leave us with fewer than 3, admit soft-dropped
    // outfits back with an appended styling tip. Base-warmth mismatches
    // are the one soft bucket left (cold-without-outerwear is auto-injected
    // upstream now).
    let final = dedupedHard;
    const mismatchTip =
      locale === "fr"
        ? "Cette pièce est légère pour le temps — ajoute des collants épais et un manteau chaud."
        : "This piece runs light for the weather — pair with thick tights and a warm coat.";

    const admit = (bucket: typeof mapped, tip: string) => {
      for (const s of bucket) {
        if (final.length >= 3) return;
        const key = [...s._ids].sort().join("|");
        if (seenSets.has(key)) continue;
        seenSets.add(key);
        const tipped = {
          ...s,
          styling_tip: s.styling_tip ? `${s.styling_tip} ${tip}` : tip,
        };
        final.push(tipped);
      }
    };

    if (final.length < 3) admit(softMismatch, mismatchTip);

    if (softMismatch.length > 0) {
      drops.push({
        ids: [],
        reason: `softMismatch=${softMismatch.length} → final=${final.length}`,
      });
    }

    if (drops.length > 0) {
      console.log(
        `[suggest] returned=${parsedOutfits.length} hard=${hardValid.length} softMismatch=${softMismatch.length} final=${final.length} drops=${JSON.stringify(drops)}`
      );
    }

    // Show at most 3.
    const suggestions = final
      .slice(0, 3)
      .map(({ _fixes: _f, _ids: _ids2, ...rest }) => rest);

    // Scrub wardrobe_gap if the AI suggested a category the user already
    // has populated. Keeps the AI from recommending "a blazer" when the
    // wardrobe already has jackets.
    const userCategoryCounts = items.reduce<Record<string, number>>((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {});
    const GAP_CATEGORY_WORDS: Record<string, string[]> = {
      bottom: ["jeans", "trousers", "pants", "leggings", "sweatpants", "skirt", "chinos", "slacks"],
      dress: ["dress", "gown", "sundress"],
      "one-piece": ["jumpsuit", "overalls", "romper"],
      outerwear: ["jacket", "blazer", "coat", "windbreaker", "puffer", "bomber", "trench", "peacoat", "parka"],
      shoes: ["sneaker", "boot", "heel", "sandal", "loafer"],
      bag: ["handbag", "tote", "backpack", "clutch", "crossbody", "purse"],
    };
    const gapMentionsOwnedCategory = (gap: string): boolean => {
      const lower = gap.toLowerCase();
      for (const [cat, words] of Object.entries(GAP_CATEGORY_WORDS)) {
        if ((userCategoryCounts[cat] ?? 0) === 0) continue;
        for (const w of words) {
          if (new RegExp(`\\b${w}s?\\b`, "i").test(lower)) return true;
        }
      }
      return false;
    };
    const rawGap = parsed.wardrobe_gap ?? null;
    const wardrobe_gap = rawGap && gapMentionsOwnedCategory(rawGap) ? null : rawGap;

    // Remember what we just showed so subsequent "Suggest" clicks bring
    // fresh combinations. Best-effort — a KV hiccup shouldn't block the
    // response.
    if (suggestions.length > 0) {
      const newSets = suggestions.map((s) => s.items.map((i) => i.id));
      const merged = [...newSets, ...kvRecentSuggestions].slice(0, 40);
      // 7-day TTL: short enough that stale bans don't ossify the
      // rotation, long enough that someone suggesting a few times a
      // week keeps a continuous anti-repetition memory.
      kv.set(suggestionsKey, merged, { ex: 60 * 60 * 24 * 7 }).catch(() => {});
    }

    return NextResponse.json({
      suggestions,
      wardrobe_gap,
    });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
