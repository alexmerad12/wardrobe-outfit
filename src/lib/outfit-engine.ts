import type {
  ClothingItem,
  Mood,
  Occasion,
  Season,
  WeatherData,
  OutfitSuggestion,
} from "./types";
import { scoreOutfitColors } from "./color-engine";
import { getSeasonFromMonth } from "./weather";

// ============================================
// Rule-based outfit filtering
// ============================================

interface FilterContext {
  weather: WeatherData | null;
  mood: Mood;
  occasion: Occasion;
  season: Season;
}

// Map temperature ranges to warmth ratings
function getWarmthRange(temp: number, sensitivity: string = "normal"): [number, number] {
  const offset = sensitivity === "runs-cold" ? 1 : sensitivity === "runs-hot" ? -1 : 0;

  if (temp <= 0) return [4 + offset, 5];
  if (temp <= 10) return [3 + offset, 5];
  if (temp <= 18) return [2 + offset, 4];
  if (temp <= 25) return [1, 3 + offset];
  return [1, 2];
}

export function filterItemsByContext(
  items: ClothingItem[],
  context: FilterContext
): ClothingItem[] {
  let filtered = [...items];

  // Season filter
  filtered = filtered.filter(
    (item) => item.seasons.length === 0 || item.seasons.includes(context.season)
  );

  // Occasion filter
  filtered = filtered.filter(
    (item) =>
      item.occasions.length === 0 || item.occasions.includes(context.occasion)
  );

  // Weather filters
  if (context.weather) {
    const [minWarmth, maxWarmth] = getWarmthRange(context.weather.temp);
    filtered = filtered.filter(
      (item) =>
        item.warmth_rating >= minWarmth && item.warmth_rating <= maxWarmth
    );

    // Rain filter — handled by the suggest pipeline's material-intelligence
    // rules (Rule 5 RAIN). Legacy rain_appropriate sort removed.
  }

  // Mood-specific fit preferences
  if (context.mood === "period" || context.mood === "cozy") {
    // Strongly prefer loose/oversized, soft materials
    filtered.sort((a, b) => {
      const comfyScore = (item: ClothingItem) => {
        let score = 0;
        if (item.fit === "oversized" || item.bottom_fit === "wide-leg") score += 3;
        if (item.fit === "loose" || item.bottom_fit === "straight" || item.bottom_fit === "flared") score += 2;
        const mats = Array.isArray(item.material) ? item.material : [item.material];
        if (mats.some((m) => ["cotton", "knit", "wool"].includes(m))) score += 1;
        return score;
      };
      return comfyScore(b) - comfyScore(a);
    });
  }

  return filtered;
}

// ============================================
// Outfit assembly
// ============================================

interface OutfitCandidate {
  top: ClothingItem | null;
  bottom: ClothingItem | null;
  shoes: ClothingItem | null;
  outerwear: ClothingItem | null;
  accessory: ClothingItem | null;
  dress: ClothingItem | null;
}

function groupByCategory(items: ClothingItem[]): Record<string, ClothingItem[]> {
  const groups: Record<string, ClothingItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateOutfitCandidates(
  items: ClothingItem[],
  context: FilterContext,
  count: number = 5
): OutfitSuggestion[] {
  const groups = groupByCategory(items);
  const candidates: OutfitSuggestion[] = [];

  const allTops = groups["top"] ?? [];
  const baseTops = shuffleArray(allTops.filter((t) => !t.is_layering_piece));
  const layeringTops = shuffleArray(allTops.filter((t) => t.is_layering_piece));
  const bottoms = shuffleArray(groups["bottom"] ?? []);
  // 'dress' and 'one-piece' (jumpsuits, overalls) both replace top + bottom,
  // so they go through the same outfit branch.
  const dresses = shuffleArray([...(groups["dress"] ?? []), ...(groups["one-piece"] ?? [])]);
  const shoes = shuffleArray(groups["shoes"] ?? []);
  const outerwear = groups["outerwear"] ?? [];
  // Layering outerwear (vests, cardigans marked as outerwear + layering)
  const layeringOuterwear = outerwear.filter((o) => o.is_layering_piece);
  const heavyOuterwear = outerwear.filter((o) => !o.is_layering_piece);
  const allLayeringPieces = [...layeringTops, ...layeringOuterwear];
  const accessories = groups["accessory"] ?? [];
  const bags = groups["bag"] ?? [];

  const needsOuterwear =
    context.weather && context.weather.temp < 15;
  // Suggest layering when it's mildly cool or cold
  const suggestLayering =
    context.weather && context.weather.temp < 20 && allLayeringPieces.length > 0;

  // Generate top + bottom combinations
  const tops = baseTops.length > 0 ? baseTops : shuffleArray(allTops);
  for (let i = 0; i < Math.min(count, Math.max(tops.length, 1)); i++) {
    const outfitItems: ClothingItem[] = [];

    if (tops[i]) outfitItems.push(tops[i]);

    // Add a layering piece sometimes (every other outfit, or always when cold)
    if (suggestLayering && (needsOuterwear || i % 2 === 0)) {
      const layer = pickRandom(allLayeringPieces);
      if (layer && layer.id !== tops[i]?.id) outfitItems.push(layer);
    }

    // Pick a bottom
    const bottom = bottoms[i % bottoms.length];
    if (bottom) outfitItems.push(bottom);

    // Pick shoes
    const shoe = pickRandom(shoes);
    if (shoe) outfitItems.push(shoe);

    // Add heavy outerwear if cold
    if (needsOuterwear) {
      const outer = pickRandom(heavyOuterwear);
      if (outer) outfitItems.push(outer);
    }

    // Maybe add an accessory
    if (Math.random() > 0.5) {
      const acc = pickRandom([...accessories, ...bags]);
      if (acc) outfitItems.push(acc);
    }

    // Score the outfit
    const colors = outfitItems
      .map((item) => item.colors[0]?.hex)
      .filter(Boolean);
    const colorScore = scoreOutfitColors(colors);

    candidates.push({
      items: outfitItems,
      score: colorScore.score,
      reasoning: "", // Will be filled by AI layer
      color_harmony: colorScore.harmony,
      mood_match: context.mood,
    });
  }

  // Also generate dress-based outfits.
  // Overalls (strap-style, exposed chest) need a top underneath; the rest of
  // the "dresses" group (mini/midi/maxi dress + jumpsuit) is full coverage.
  for (const dress of dresses.slice(0, 2)) {
    const outfitItems: ClothingItem[] = [dress];
    const needsBaseTop = dress.subcategory === "overalls";

    if (needsBaseTop) {
      const baseTop = pickRandom(tops);
      if (baseTop) outfitItems.push(baseTop);
    }

    // Layer over a dress (cardigan, vest, etc.)
    if (suggestLayering) {
      const layer = pickRandom(allLayeringPieces);
      if (layer) outfitItems.push(layer);
    }

    const shoe = pickRandom(shoes);
    if (shoe) outfitItems.push(shoe);

    if (needsOuterwear) {
      const outer = pickRandom(heavyOuterwear);
      if (outer) outfitItems.push(outer);
    }

    const acc = pickRandom([...accessories, ...bags]);
    if (acc) outfitItems.push(acc);

    const colors = outfitItems
      .map((item) => item.colors[0]?.hex)
      .filter(Boolean);
    const colorScore = scoreOutfitColors(colors);

    candidates.push({
      items: outfitItems,
      score: colorScore.score,
      reasoning: "",
      color_harmony: colorScore.harmony,
      mood_match: context.mood,
    });
  }

  // Sort by color score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, count);
}

// ============================================
// Mood-based color preferences
// ============================================

export const MOOD_COLOR_PREFERENCES: Record<
  Mood,
  { prefer: string[]; avoid: string[]; harmonyPreference: string }
> = {
  energized: {
    prefer: ["bright", "saturated"],
    avoid: ["muted", "dark"],
    harmonyPreference: "complementary",
  },
  confident: {
    prefer: ["deep", "rich"],
    avoid: ["pastel"],
    harmonyPreference: "monochromatic",
  },
  playful: {
    prefer: ["colorful", "patterns"],
    avoid: ["dark"],
    harmonyPreference: "triadic",
  },
  cozy: {
    prefer: ["warm", "earth tones"],
    avoid: ["cold", "bright"],
    harmonyPreference: "analogous",
  },
  chill: {
    prefer: ["neutral", "pastel"],
    avoid: ["loud"],
    harmonyPreference: "monochromatic",
  },
  bold: {
    prefer: ["high contrast", "statement"],
    avoid: [],
    harmonyPreference: "complementary",
  },
  period: {
    prefer: ["soft", "comfort"],
    avoid: ["tight", "structured"],
    harmonyPreference: "analogous",
  },
  sad: {
    prefer: ["comforting", "uplifting"],
    avoid: [],
    harmonyPreference: "analogous",
  },
};
