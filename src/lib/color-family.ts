// Buckets every wardrobe color hex into one of 12 broad families so the
// profile color distribution stays readable instead of fragmenting into
// dozens of near-identical names ("Red", "Crimson", "Burgundy"...).
// Buckets are picked from HSL — saturation and lightness gate neutrals
// and earth tones first, then hue picks the chromatic family.

export type ColorFamilyKey =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "beige"
  | "black"
  | "white"
  | "gray";

// Muted, editorial swatches — desaturated by design so the bars read
// as a polished palette rather than a Material primary set. Tuned for
// readability on a light background while keeping the family obvious.
const SWATCH: Record<ColorFamilyKey, string> = {
  red: "#b85450",      // terracotta
  orange: "#c98760",   // caramel
  yellow: "#c9a84e",   // mustard
  green: "#7a9b76",    // sage
  blue: "#6f8aa6",     // slate blue
  purple: "#8e6f9c",   // dusty lavender
  pink: "#d6909c",     // dusty rose
  brown: "#7c5b4f",    // warm earth
  beige: "#d4c4b0",    // warm beige
  black: "#2a2826",    // off-black
  white: "#f5f0ea",    // warm off-white
  gray: "#a8a4a0",     // warm gray
};

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

export function colorFamily(hex: string): ColorFamilyKey {
  const { h, s, l } = hexToHsl(hex);
  const sPct = s * 100;
  const lPct = l * 100;

  // Pure neutrals first — saturation/lightness override hue.
  if (lPct >= 90) return "white";
  if (lPct <= 12) return "black";
  if (sPct < 10) return "gray";
  // Cool charcoal / slate: low-saturation darks read as gray, not
  // their underlying hue. Without this #36454f (slate) gets bucketed
  // as blue.
  if (sPct < 20 && lPct < 35) return "gray";

  // Earth tones — warm hues at low saturation. Beige is the pale end,
  // brown is the dark end. Both override the chromatic hue buckets.
  // Beige sat cap was 35 — too tight; classic tan #d2b48c sits at
  // sat ~44 and was falling through to orange.
  if (sPct < 50 && lPct >= 60 && h >= 20 && h <= 55) return "beige";
  // Brown wraps around the red boundary so wine-burgundy darks
  // (#3C1414 at hue 0, #4a2c2a near hue 5) bucket as brown instead
  // of red. Saturation cap stays at 65 so true dark reds (#800000,
  // sat 100) still go to red.
  if (lPct < 50 && sPct < 65 && (h <= 45 || h >= 345)) return "brown";

  // Chromatic hue buckets.
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 260) return "blue";
  if (h < 305) return "purple";
  return "pink";
}

export function colorFamilySwatch(key: ColorFamilyKey): string {
  return SWATCH[key];
}
