import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";
import { getWeather, getSeasonFromMonth } from "@/lib/weather";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

const anthropic = new Anthropic();

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
  if (item.rain_appropriate) parts.push("Rain-proof");
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
1. A dress or jumpsuit is STANDALONE on the body. Never combined with a "top" or "bottom" category item. Only outerwear can layer over.
2. Overalls are the one exception: they require a "top" underneath.
3. Every outfit needs a complete base: (a) a dress, (b) a jumpsuit, (c) overalls + top, or (d) top + bottom.
4. Max one item per subcategory across the whole outfit (no two belts, no two pairs of shoes).
5. WEATHER (NON-NEGOTIABLE):
   - Cold (<12°C): the outfit MUST include an item whose category is literally "outerwear" in the wardrobe list (look at the parenthesized category on each [id] line — e.g. "(outerwear/jacket)"). Sweaters, cardigans, and hoodies belong to "top" NOT "outerwear" — they DO NOT satisfy this rule. If the wardrobe has zero outerwear items, skip the rule.
   - Cold base layer: the dress / jumpsuit / top+bottom under the coat must ALSO handle the temperature — the coat comes off indoors. At <10°C, base Warmth ≥2; at <5°C, Warmth ≥2.5. Prefer midi/maxi, knit/wool, fall or winter in Seasons.
   - Warm (>22°C): no heavy coats, no wool, no heavy boots.
   - Rain ≥40%: prefer rain-proof items.
6. SHOES: every outfit EXCEPT occasion = at-home MUST include a "shoes" category item. No exceptions.
7. AT-HOME: no bag. Scarves only if Warmth ≤2 (thin bandana / silk kerchief). Never pair a turtleneck top with any scarf at home.
8. EVENING COCKTAIL: for date / dinner-out / party, bias toward dressy materials (silk, satin, chiffon, lace, velvet, sequined) and mini-to-midi dress length when a dress-based look fits.
9. OFFICE: for work, the classic template is (a) a dress with Silhouette "sheath" + blazer + pump (low/mid heel), or (b) tailored trousers + blouse + pump. Prefer sheath silhouette when picking a dress for work; avoid "bodycon" / "slip" / "mermaid" for the office. No denim bottoms. No athletic sneakers. If the wardrobe lacks the ideal staple, still propose the best available outfit AND name the missing piece in styling_tip ("A pointed-toe pump would finish this", "A structured blazer would sharpen it").
10. SHOE × OCCASION: work → pump / slingback (low-to-mid heel); brunch / date / creative-office → kitten heel or ballet flat; party / formal → strappy sandal or heeled sandal; cocktail does NOT strictly require a heel — a dressy flat can work.
11. BAG × FORMALITY: formal / party / date → prefer Bag size "clutch" or "small"; work → "medium" or "large"; casual / travel → "tote" or "large" is fine; at-home → no bag at all. Use Bag size field when available on the item.
12. STYLE DIRECTION (when present):
   a) ITEM ANCHOR: if STYLE DIRECTION names a specific wardrobe piece — possessive form ("with my black blazer", "wear my red dress", "use my white sneakers") OR a color + category phrase that points to a real item ("the leather jacket", "the green skirt") — find the closest matching item in the wardrobe by name/color/category. Treat that item as an ANCHOR: every outfit MUST include it. If the wardrobe has no matching piece, ignore that specific phrase (don't invent).
   b) HARD-ENFORCED PRESETS — treat these as non-negotiable when present anywhere in STYLE DIRECTION (English or French, case-insensitive):
      - "all black" / "tout en noir" / "all-black": EVERY visible item in the outfit must be black or near-black (charcoal, jet, ink). No denim, no beige, no white sneakers, no pastels. If you can't build a complete all-black outfit from the wardrobe, skip this outfit slot rather than break the rule.
      - "mix patterns" / "mixer les motifs" / "mix-patterns": at least 2 items in the outfit must have a non-solid pattern (striped, plaid, floral, animal-print, etc.). Solid pieces are fine as the third/fourth.
      - "dress day" / "journée robe" / "dress-day": the outfit must be built around a dress (category="dress"). Exception: if the wardrobe has zero dresses, fall back gracefully.
   c) SOFT VIBE: any other phrase ("more drapey", "less colorful", "office chic", custom user text) is a hint — bias the outfits toward it but no hard requirement.
13. MOOD (must be visibly expressed in EVERY outfit — different moods + same occasion MUST produce visibly different outfits):
   - Energized → at least one saturated bright (red, orange, yellow, fuchsia, electric blue, kelly green). No all-neutral palette.
   - Confident → tailored / structured silhouette (blazer, sheath, sharp lines). Polished, intentional. No slouchy proportions.
   - Playful → unexpected pairing or one whimsical element: print mix, color block, statement accessory, contrast color. Not a safe monochrome.
   - Cozy → soft textures (knit, cashmere, fleece, jersey, wool). Warm earth tones (camel, cream, oatmeal, rust, chocolate). Relaxed not slouchy.
   - Chill → relaxed easy silhouette, neutral palette, minimal jewelry. Elevated t-shirt-and-jeans energy.
   - Bold → at least one statement piece: bright saturated color OR distinctive pattern (animal, plaid, embellished) OR dramatic silhouette (oversized blazer, mini, leather). No safe choices.
   - Comfort Day → elastic / drawstring / pull-on bottoms preferred. Soft top (knit, jersey, oversized). NEVER heels. NEVER tailored / fitted / structured. Easy on the body.
   - Need a Hug → soft pastels OR oversized cozy pieces. Comfort with one warm/uplifting touch. No edgy / hard / dark.

STYLING INTENT: One focal point. Mix textures — ideally pair one fitted piece with one looser piece. Use outerwear as a finisher when it fits the weather and occasion. Lean into the user's favorites for preferences but bring at least one fresh angle.

ROTATION: Keep the wardrobe moving. Each item shows a wear-frequency signal ("Never worn", "Worn 3x", "Last worn 21d ago"). When choosing between two comparable options that both fit the rules above, prefer the LESS-WORN one. Across 4 outfits, deliberately include at least 2 pieces that are "Never worn" or haven't been worn in 30+ days IF the wardrobe has any — don't default to the same anchor items every call.

Wardrobe gap: before suggesting one, count what the user ALREADY has per category. Don't suggest outerwear if they have any jackets; don't suggest a dress if they have dresses. Set to null when the wardrobe is covered.

Call the propose_outfits tool with exactly 4 outfits. Per outfit:
- item_ids: 3-6 item IDs from the WARDROBE (use [id] values verbatim).
- name: Short 2-4 word look name in ${languageName}.
- reasoning: ONE short editorial sentence in ${languageName}. Cite ONE specific styling principle at play — color harmony (warm/cool contrast, monochrome, analogous), silhouette balance (fitted + loose, long + cropped), texture play (smooth + nubby, matte + sheen), or occasion fit. Refer to pieces by broad category only (the dress, the bottoms, the jacket, the shoes, the belt). Write like Vogue, not like a bot. Skip filler like "perfect for" or "this outfit works because".
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
    type RawOutfit = NonNullable<ParsedShape["outfits"]>[number];
    type MappedOutfit = {
      items: ClothingItem[];
      score: number;
      reasoning: string;
      styling_tip: string | null;
      color_harmony: string;
      mood_match: Mood;
      name: string;
      weather_temp: number | null;
      weather_condition: string | null;
      _fixes: string[];
      _ids: string[];
    };
    type CandidateResult =
      | { kind: "hard"; outfit: MappedOutfit }
      | { kind: "soft"; outfit: MappedOutfit }
      | { kind: "drop"; reason: string; ids: string[] };

    const wardrobeHasShoes = items.some((i) => i.category === "shoes");

    const wishText = styleWishes.join(" ").toLowerCase();
    const wantsAllBlack = /all[ -]?black|tout en noir/i.test(wishText);
    const wantsDressDay = /dress[ -]?day|journ[ée]e robe/i.test(wishText);
    const wantsMixPatterns = /mix[ -]?patterns?|mixer les motifs/i.test(wishText);

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

    // Per-outfit pipeline: combines the auto-fix map phase and the
    // hard-validation filter phase from the pre-streaming version. Pure
    // function of the candidate + closed-over wardrobe context, so we
    // can call it incrementally as outfits stream in from Anthropic.
    function processCandidate(s: RawOutfit): CandidateResult {
      const rawItems = s.item_ids
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as ClothingItem[];

      const rawHasDress = rawItems.some((i) => i.category === "dress");
      const rawHasJumpsuit = rawItems.some(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      const rawHasOnePiece = rawItems.some((i) => i.category === "one-piece");
      const fixes: string[] = [];

      let stripped = rawItems;
      if ((rawHasDress || rawHasOnePiece) && stripped.some((i) => i.category === "bottom")) {
        stripped = stripped.filter((i) => i.category !== "bottom");
        fixes.push("stripped bottom (dress/jumpsuit present)");
      }
      if ((rawHasDress || rawHasJumpsuit) && stripped.some(
        (i) => i.category === "top" && !i.is_layering_piece && i.subcategory !== "cardigan"
      )) {
        stripped = stripped.filter(
          (i) => i.category !== "top" || i.is_layering_piece || i.subcategory === "cardigan"
        );
        fixes.push("stripped non-layering top (dress/jumpsuit present)");
      }
      {
        const seen = new Set<string>();
        const deduped: ClothingItem[] = [];
        for (const i of stripped) {
          if (i.subcategory && seen.has(i.subcategory)) continue;
          if (i.subcategory) seen.add(i.subcategory);
          deduped.push(i);
        }
        if (deduped.length !== stripped.length) fixes.push("deduped subcategories");
        stripped = deduped;
      }
      {
        const SINGLE_PIECE = new Set<string>(["shoes", "bag", "bottom", "dress", "one-piece"]);
        const seenCat = new Set<string>();
        const dedupedByCat: ClothingItem[] = [];
        for (const i of stripped) {
          if (SINGLE_PIECE.has(i.category) && seenCat.has(i.category)) continue;
          if (SINGLE_PIECE.has(i.category)) seenCat.add(i.category);
          dedupedByCat.push(i);
        }
        if (dedupedByCat.length !== stripped.length) fixes.push("deduped single-piece categories");
        stripped = dedupedByCat;
      }

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
        if (stripped.length !== beforeLen) fixes.push("stripped scarf (at-home rule)");
      }

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

      if (
        occasion !== "at-home" &&
        !stripped.some((i) => i.category === "shoes")
      ) {
        const availableShoes = items.filter(
          (i) => i.category === "shoes" && !i.is_stored
        );
        if (availableShoes.length > 0) {
          const occasionMatches = availableShoes.filter((sh) =>
            Array.isArray(sh.occasions) && sh.occasions.includes(occasion as Occasion)
          );
          const best = occasionMatches[0] ?? availableShoes[0];
          stripped = [...stripped, best];
          fixes.push(`injected shoes: ${best.subcategory ?? "shoes"}`);
        }
      }

      const outfitItems = orderOutfitItems(stripped);

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

      const mapped: MappedOutfit = {
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

      // Hard validation — same checks as the pre-streaming filter phase.
      if (occasion !== "at-home" && wardrobeHasShoes) {
        if (!mapped.items.some((i) => i.category === "shoes")) {
          return { kind: "drop", reason: "missing shoes", ids: mapped._ids };
        }
      }
      if (wantsAllBlack) {
        const offender = mapped.items.find((i) => !isDarkItem(i));
        if (offender) {
          return {
            kind: "drop",
            reason: `all-black: "${offender.name}" primary color "${offender.colors?.[0]?.name}" not dark`,
            ids: mapped._ids,
          };
        }
      }
      if (wantsDressDay) {
        if (!mapped.items.some((i) => i.category === "dress")) {
          return { kind: "drop", reason: "dress-day preset but no dress", ids: mapped._ids };
        }
      }
      if (wantsMixPatterns) {
        const nonSolidCount = mapped.items.filter((i) => {
          const patterns = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
          return patterns.some((p) => p && p !== "solid");
        }).length;
        if (nonSolidCount < 2) {
          return {
            kind: "drop",
            reason: `mix-patterns: only ${nonSolidCount} non-solid item(s)`,
            ids: mapped._ids,
          };
        }
      }
      const hasDress = mapped.items.some((i) => i.category === "dress");
      const hasOnePiece = mapped.items.some((i) => i.category === "one-piece");
      const hasTop = mapped.items.some((i) => i.category === "top");
      const hasBottom = mapped.items.some((i) => i.category === "bottom");
      const isOveralls = mapped.items.some(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (!hasDress && hasOnePiece) {
        if (isOveralls && !hasTop) return { kind: "drop", reason: "overalls without top", ids: mapped._ids };
      } else if (!hasDress && !hasOnePiece) {
        if (!(hasTop && hasBottom)) return { kind: "drop", reason: "incomplete base", ids: mapped._ids };
      }
      if (weather && typeof weather.temp === "number") {
        const baseW = baseWarmth(mapped.items);
        if (
          (weather.temp < 5 && baseW < 2.5) ||
          (weather.temp < 10 && baseW < 2)
        ) {
          return { kind: "soft", outfit: mapped };
        }
      }
      return { kind: "hard", outfit: mapped };
    }

    const jaccard = (a: string[], b: string[]): number => {
      const setB = new Set(b);
      const intersection = a.filter((x) => setB.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union === 0 ? 0 : intersection / union;
    };

    // Wardrobe-gap scrubber: drop the AI's gap suggestion if it names a
    // category the user already owns ("a blazer" when the wardrobe has
    // jackets). Built from item categories at request time so it scales
    // with their actual closet.
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

    const mismatchTip =
      locale === "fr"
        ? "Cette pièce est légère pour le temps — ajoute des collants épais et un manteau chaud."
        : "This piece runs light for the weather — pair with thick tights and a warm coat.";

    // Stream outfits to the client as Anthropic generates them. Each
    // completed outfit runs through processCandidate + cross-outfit
    // dedup and is emitted the moment it passes — so the UI sees outfit
    // #1 around 3s instead of waiting ~10s for the whole batch.
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const send = (event: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        const seenSets = new Set<string>();
        const dedupedHard: MappedOutfit[] = [];
        const softMismatch: MappedOutfit[] = [];
        const drops: { ids: string[]; reason: string }[] = [];
        let totalReturned = 0;

        const handleCompleted = (raw: RawOutfit | null | undefined) => {
          if (!raw || !Array.isArray(raw.item_ids)) return;
          totalReturned++;
          const result = processCandidate(raw);
          if (result.kind === "drop") {
            drops.push({ ids: result.ids, reason: result.reason });
            return;
          }
          if (result.kind === "soft") {
            softMismatch.push(result.outfit);
            return;
          }
          const ids = result.outfit._ids;
          const key = [...ids].sort().join("|");
          if (seenSets.has(key)) {
            drops.push({ ids, reason: "duplicate of another outfit" });
            return;
          }
          const tooSimilar = dedupedHard.some(
            (kept) => jaccard(kept._ids, ids) >= 0.6
          );
          if (tooSimilar) {
            drops.push({ ids, reason: "too similar to another outfit" });
            return;
          }
          seenSets.add(key);
          dedupedHard.push(result.outfit);
          if (dedupedHard.length <= 3) {
            const { _fixes: _f, _ids: _i, ...rest } = result.outfit;
            send({ type: "outfit", data: rest });
          }
        };

        try {
          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1400,
            temperature: 1,
            tools: [
              {
                name: "propose_outfits",
                description: "Return the 4 outfit suggestions and an optional wardrobe gap.",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    outfits: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          item_ids: { type: "array", items: { type: "string" } },
                          name: { type: "string" },
                          reasoning: { type: "string" },
                          styling_tip: { type: ["string", "null"] },
                        },
                        required: ["item_ids", "name", "reasoning"],
                      },
                    },
                    wardrobe_gap: { type: ["string", "null"] },
                  },
                  required: ["outfits"],
                },
              },
            ],
            tool_choice: { type: "tool", name: "propose_outfits" },
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

          // The SDK's inputJson event fires with a partial-JSON snapshot
          // as the tool input streams in. An outfit at index N is fully
          // populated once index N+1 begins (the streaming JSON parser
          // only advances past an array element once it closes), so we
          // process [0..emittedCount) eagerly and handle the last one
          // at end-of-stream.
          let emittedCount = 0;
          let latestSnapshot: ParsedShape | null = null;
          stream.on("inputJson", (_partialJson, jsonSnapshot) => {
            if (
              !jsonSnapshot ||
              typeof jsonSnapshot !== "object" ||
              !("outfits" in jsonSnapshot) ||
              !Array.isArray((jsonSnapshot as ParsedShape).outfits)
            ) {
              return;
            }
            latestSnapshot = jsonSnapshot as ParsedShape;
            const outs = latestSnapshot.outfits ?? [];
            while (outs.length > emittedCount + 1) {
              handleCompleted(outs[emittedCount]);
              emittedCount++;
            }
          });

          const finalMsg = await stream.finalMessage();
          const toolUse = finalMsg.content.find((c) => c.type === "tool_use");
          const finalInput =
            toolUse && toolUse.type === "tool_use"
              ? (toolUse.input as ParsedShape)
              : null;

          // Drain remaining outfits — the length-trigger above never
          // fires for the final array element.
          const snapOutfits =
            latestSnapshot === null ? [] : (latestSnapshot as ParsedShape).outfits ?? [];
          const finalOutfits = finalInput?.outfits ?? snapOutfits;
          while (emittedCount < finalOutfits.length) {
            handleCompleted(finalOutfits[emittedCount]);
            emittedCount++;
          }

          if (totalReturned === 0) {
            console.error(
              `[suggest] AI returned unexpected shape; stop=${finalMsg.stop_reason}`,
              finalInput
            );
            send({
              type: "error",
              message: `AI returned an unexpected shape — stop=${finalMsg.stop_reason}`,
            });
            controller.close();
            return;
          }

          // Soft fallback: if hard-valid alone is short of 3, admit
          // base-warmth-mismatch outfits with the tip appended.
          if (dedupedHard.length < 3) {
            for (const s of softMismatch) {
              if (dedupedHard.length >= 3) break;
              const key = [...s._ids].sort().join("|");
              if (seenSets.has(key)) continue;
              seenSets.add(key);
              const tipped: MappedOutfit = {
                ...s,
                styling_tip: s.styling_tip ? `${s.styling_tip} ${mismatchTip}` : mismatchTip,
              };
              dedupedHard.push(tipped);
              const { _fixes: _f, _ids: _i, ...rest } = tipped;
              send({ type: "outfit", data: rest });
            }
          }
          if (softMismatch.length > 0) {
            drops.push({
              ids: [],
              reason: `softMismatch=${softMismatch.length} → final=${dedupedHard.length}`,
            });
          }

          if (drops.length > 0) {
            console.log(
              `[suggest] returned=${totalReturned} hard=${dedupedHard.length} softMismatch=${softMismatch.length} drops=${JSON.stringify(drops)}`
            );
          }

          // Wardrobe gap (scrubbed) is sent after all outfits.
          const rawGap = finalInput?.wardrobe_gap ?? null;
          const wardrobe_gap = rawGap && gapMentionsOwnedCategory(rawGap) ? null : rawGap;
          send({ type: "gap", data: wardrobe_gap });

          // Remember what we just showed so subsequent "Suggest" clicks
          // bring fresh combinations. Best-effort — a KV hiccup
          // shouldn't block the response.
          const finalSuggestions = dedupedHard.slice(0, 3);
          if (finalSuggestions.length > 0) {
            const newSets = finalSuggestions.map((s) => s._ids);
            const merged = [...newSets, ...kvRecentSuggestions].slice(0, 40);
            kv.set(suggestionsKey, merged, { ex: 60 * 60 * 24 * 7 }).catch(() => {});
          }

          send({ type: "done" });
          controller.close();
        } catch (err) {
          console.error("Suggestion error:", err);
          send({ type: "error", message: "Failed to generate suggestions" });
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
