import chroma from "chroma-js";
import type { HSLColor } from "./types";

// ============================================
// Color classification
// ============================================

const KNOWN_NEUTRALS = ["#000000", "#ffffff", "#808080", "#c0c0c0", "#f5f5dc", "#d2b48c"];

export function isNeutralColor(hex: string): boolean {
  const [, s, l] = chroma(hex).hsl();
  // Low saturation = neutral (grays, whites, blacks)
  if (s < 0.12) return true;
  // Very dark or very light with low saturation = neutral
  if ((l < 0.15 || l > 0.92) && s < 0.25) return true;
  // Check against known neutral hex values
  const distance = Math.min(...KNOWN_NEUTRALS.map((n) => chroma.deltaE(hex, n)));
  return distance < 15;
}

export function hexToHSL(hex: string): HSLColor {
  const [h, s, l] = chroma(hex).hsl();
  return {
    h: isNaN(h) ? 0 : Math.round(h),
    s: Math.round((s ?? 0) * 100),
    l: Math.round(l * 100),
  };
}

// Collapse perceptually-similar colors into a single entry. Keeps the first
// occurrence (usually the most-dominant) and merges the percentages of any
// colors within `threshold` deltaE. Default threshold ~15 matches how CIE
// deltaE treats "clearly distinguishable" colors — tighter and we'd still
// show near-duplicates like "two grays", looser and we'd merge genuinely
// different shades.
export function dedupeColors<T extends { hex: string; percentage: number }>(
  colors: T[],
  threshold = 15
): T[] {
  const result: T[] = [];
  for (const c of colors) {
    const match = result.find((r) => chroma.deltaE(r.hex, c.hex) < threshold);
    if (match) {
      match.percentage = Math.min(100, match.percentage + c.percentage);
    } else {
      result.push({ ...c });
    }
  }
  return result;
}

// ============================================
// Color harmony checks
// ============================================

function hueDifference(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

export type HarmonyType = "monochromatic" | "analogous" | "complementary" | "split-complementary" | "triadic" | "neutral-pair";

export function getColorHarmony(hsl1: HSLColor, hsl2: HSLColor): HarmonyType | null {
  const diff = hueDifference(hsl1.h, hsl2.h);
  const TOLERANCE = 20;

  if (diff <= 15) return "monochromatic";
  if (diff <= 30 + TOLERANCE) return "analogous";
  if (Math.abs(diff - 180) <= TOLERANCE) return "complementary";
  if (Math.abs(diff - 150) <= TOLERANCE || Math.abs(diff - 210) <= TOLERANCE) return "split-complementary";
  if (Math.abs(diff - 120) <= TOLERANCE) return "triadic";
  return null;
}

export function scoreColorPair(hex1: string, hex2: string): { score: number; harmony: HarmonyType | string } {
  const neutral1 = isNeutralColor(hex1);
  const neutral2 = isNeutralColor(hex2);

  // Two neutrals always work
  if (neutral1 && neutral2) return { score: 0.7, harmony: "neutral-pair" };
  // One neutral + one chromatic always works
  if (neutral1 || neutral2) return { score: 0.8, harmony: "neutral-pair" };

  const hsl1 = hexToHSL(hex1);
  const hsl2 = hexToHSL(hex2);
  const harmony = getColorHarmony(hsl1, hsl2);

  if (!harmony) return { score: 0.2, harmony: "none" };

  const scores: Record<HarmonyType, number> = {
    monochromatic: 0.85,
    analogous: 0.9,
    complementary: 0.95,
    "split-complementary": 0.88,
    triadic: 0.82,
    "neutral-pair": 0.8,
  };

  return { score: scores[harmony], harmony };
}

// Score an entire outfit's color combination
export function scoreOutfitColors(hexColors: string[]): { score: number; harmony: string } {
  if (hexColors.length <= 1) return { score: 1, harmony: "single" };

  const chromaticColors = hexColors.filter((h) => !isNeutralColor(h));

  // All neutrals = safe, score well
  if (chromaticColors.length === 0) return { score: 0.75, harmony: "all-neutral" };

  // Too many chromatic colors = messy (unless mood is playful/bold)
  if (chromaticColors.length > 3) return { score: 0.3, harmony: "too-many-colors" };

  // Score all chromatic pairs
  let totalScore = 0;
  let bestHarmony = "mixed";
  let pairs = 0;

  for (let i = 0; i < chromaticColors.length; i++) {
    for (let j = i + 1; j < chromaticColors.length; j++) {
      const { score, harmony } = scoreColorPair(chromaticColors[i], chromaticColors[j]);
      totalScore += score;
      if (score > 0.8) bestHarmony = harmony;
      pairs++;
    }
  }

  return {
    score: pairs > 0 ? totalScore / pairs : 0.5,
    harmony: bestHarmony,
  };
}

// Get a human-readable color name from hex
export function getColorName(hex: string): string {
  const [h, s, l] = chroma(hex).hsl();

  if (isNaN(h) || s < 0.1) {
    if (l > 0.9) return "White";
    if (l < 0.15) return "Black";
    return "Gray";
  }
  if (s < 0.2 && l > 0.6) return "Beige";
  if (s < 0.2) return "Gray";

  // Map hue to color names
  if (h < 15 || h >= 345) return l < 0.4 ? "Burgundy" : "Red";
  if (h < 40) return l > 0.7 ? "Peach" : "Orange";
  if (h < 65) return l > 0.7 ? "Cream" : "Yellow";
  if (h < 80) return "Lime";
  if (h < 160) return l < 0.35 ? "Forest Green" : "Green";
  if (h < 190) return "Teal";
  if (h < 210) return l > 0.6 ? "Sky Blue" : "Blue";
  if (h < 260) return l < 0.35 ? "Navy" : "Blue";
  if (h < 280) return "Purple";
  if (h < 320) return l > 0.6 ? "Pink" : "Magenta";
  return l > 0.6 ? "Pink" : "Rose";
}
