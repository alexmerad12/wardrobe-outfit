import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
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

    // KV-backed short-term memory of outfits we've SUGGESTED to this user.
    // The `recent_outfits` table tracks worn outfits; it wouldn't catch the
    // user mashing "Suggest" four times in five minutes and getting the
    // same three looks each time. We cap at 25 remembered sets with a 12h
    // TTL so stale bans don't accumulate forever.
    const suggestionsKey = `recent-suggestions:${userId}`;
    const kvRecentSuggestions = (await kv
      .get<string[][]>(suggestionsKey)
      .catch(() => null)) ?? [];

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

    const dynamicSuffix = `

WEATHER: ${weatherDesc}
SEASON: ${currentSeason}
MOOD: ${moodInfo.label} — ${moodInfo.description}
OCCASION: ${occasionLabel}${styleWishes.length > 0 ? `\nSTYLE DIRECTION: ${styleWishes.join(", ")}` : ""}${anchorItemId ? `\nANCHOR ITEM: Every outfit MUST include item id [${anchorItemId}].` : ""}
ITERATION: ${iterationNonce}

Return exactly 4 complete outfits from the wardrobe. They MUST be visibly different from each other (vary silhouette, color, or structure) AND different from every set in RECENTLY SHOWN OR WORN. (We display 3 to the user; the 4th is a backup in case one gets filtered out.)

HARD RULES — do not violate:
1. A dress or jumpsuit is STANDALONE on the body. Never combined with a "top" or "bottom" category item. Only outerwear can layer over.
2. Overalls are the one exception: they require a "top" underneath.
3. Every outfit needs a complete base: (a) a dress, (b) a jumpsuit, (c) overalls + top, or (d) top + bottom. Top alone is not an outfit.
4. Max one item per subcategory across the whole outfit (no two belts, no two pairs of shoes, etc).
5. Match weather: cold (<12°C) = long sleeves + closed shoes + warm pieces; warm (>22°C) = light materials, no heavy coats. Always return 3 outfits — work with what the wardrobe has.
6. Occasion sets formality; mood sets the energy. At-home = comfort wear, no bag; work/date/party/dinner = include shoes.

STYLING INTENT: One focal point. Mix textures. Use outerwear as a finisher when the wardrobe has it and it fits the weather. Lean into the user's favorites for preferences but bring at least one fresh angle.

Wardrobe gap: before suggesting one, count what the user ALREADY has per category. Don't suggest outerwear if they have any jackets; don't suggest a dress if they have dresses. Set to null when the wardrobe is covered.

Call the propose_outfits tool with exactly 4 outfits. Per outfit:
- item_ids: 3-6 item IDs from the WARDROBE (use [id] values verbatim).
- name: Short 2-4 word look name in ${languageName}, no material / color words.
- reasoning: ONE short sentence in ${languageName} on why this look works for the mood / occasion / weather. Refer to pieces by broad category ONLY (the dress, the bottoms, the jacket, the shoes, the belt). NEVER name materials (leather, silk, satin, denim, suede, cotton, wool), colors, subcategories (moto, biker, bomber, maxi, midi, crop, tank, blouse, jeans, trousers, boots, heels), or brands.
- styling_tip: ONE short sentence in ${languageName} with a concrete styling action (tuck, cuff, half-button, layer open, cinch). Same generic vocab rules as reasoning. null if nothing useful fits.

wardrobe_gap: One short sentence about a missing staple, or null if the wardrobe is covered.`;

    // Use Anthropic's tool_use with a JSON schema instead of asking for raw
    // JSON in a text response. Free-form JSON was failing to parse ~30% of
    // the time because the AI slipped unescaped quotes / dashes into the
    // reasoning and styling_tip strings; tool_use returns structured data
    // already validated against the schema so parse errors can't happen.
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.error("[suggest] AI returned no tool_use block", message.stop_reason);
      return NextResponse.json({ suggestions: [], message: "Failed to parse AI response" });
    }

    const parsed = toolUse.input as {
      outfits: {
        item_ids: string[];
        name?: string;
        reasoning?: string | null;
        styling_tip?: string | null;
      }[];
      wardrobe_gap?: string | null;
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

    const mapped = parsed.outfits.map((s) => {
      const outfitItems = s.item_ids
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as ClothingItem[];

      const hasDress = outfitItems.some((i) => i.category === "dress");
      const hasJumpsuit = outfitItems.some(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      const hasOnePiece = outfitItems.some((i) => i.category === "one-piece");
      const hasBottom = outfitItems.some((i) => i.category === "bottom");
      // A top "over" a dress is only nonsensical if it's a regular top
      // (tee, blouse, tank, crop top). Cardigans and anything explicitly
      // flagged as a layering piece are legitimate over-dress layers —
      // don't drop the outfit for them.
      const hasNonLayeringTop = outfitItems.some(
        (i) =>
          i.category === "top" &&
          !i.is_layering_piece &&
          i.subcategory !== "cardigan"
      );
      const dressWithBottom = (hasDress || hasOnePiece) && hasBottom;
      const dressWithTop = (hasDress || hasJumpsuit) && hasNonLayeringTop;

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
      const styling_tip =
        aiTip && textIsConsistent(outfitItems, aiTip)
          ? aiTip
          : buildStylingTip(outfitItems, locale);
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
        _violations: { dressWithBottom, dressWithTop, duplicateSub },
        _ids: outfitItems.map((i) => i.id),
      };
    });

    // Filter with logging so when an outfit drops we can see why in
    // server logs (and surface it in the response for debugging).
    const drops: { ids: string[]; reason: string }[] = [];
    const validOutfits = mapped.filter((s) => {
      if (s._violations.dressWithBottom) {
        drops.push({ ids: s._ids, reason: "dress+bottom" });
        return false;
      }
      if (s._violations.dressWithTop) {
        drops.push({ ids: s._ids, reason: "dress+top" });
        return false;
      }
      if (s._violations.duplicateSub) {
        drops.push({ ids: s._ids, reason: "duplicate subcategory" });
        return false;
      }
      const hasDress = s.items.some((i) => i.category === "dress");
      const hasOnePiece = s.items.some((i) => i.category === "one-piece");
      const hasTop = s.items.some((i) => i.category === "top");
      const hasBottom = s.items.some((i) => i.category === "bottom");
      const isOveralls = s.items.some(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (hasDress) return true;
      if (hasOnePiece) {
        if (!isOveralls || hasTop) return true;
        drops.push({ ids: s._ids, reason: "overalls without top" });
        return false;
      }
      if (hasTop && hasBottom) return true;
      drops.push({ ids: s._ids, reason: "incomplete base" });
      return false;
    });

    // Dedupe: if two of the 4 share the exact same item set, keep only one.
    const seenSets = new Set<string>();
    const deduped = validOutfits.filter((s) => {
      const key = [...s._ids].sort().join("|");
      if (seenSets.has(key)) {
        drops.push({ ids: s._ids, reason: "duplicate of another outfit" });
        return false;
      }
      seenSets.add(key);
      return true;
    });

    if (drops.length > 0) {
      console.log(
        `[suggest] returned=${parsed.outfits.length} valid=${validOutfits.length} deduped=${deduped.length} drops=${JSON.stringify(drops)}`
      );
    }

    // Show at most 3 — the AI was asked for 4 so we have slack.
    const suggestions = deduped
      .slice(0, 3)
      .map(({ _violations: _v, _ids: _ids2, ...rest }) => rest);

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
      const merged = [...newSets, ...kvRecentSuggestions].slice(0, 25);
      kv.set(suggestionsKey, merged, { ex: 60 * 60 * 12 }).catch(() => {});
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
