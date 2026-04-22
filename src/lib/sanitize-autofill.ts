// Coerce raw AI output into values our DB schema will actually accept.
//
// Claude's vision model will occasionally return values that look right
// but don't match our enums exactly ("t_shirt" vs "t-shirt", "blue" as a
// material, "summer" as an occasion). The Supabase insert then 400s with a
// check-constraint violation and the whole upload errors.
//
// This helper drops anything that isn't on the allowlist — better to fall
// back to the field's default than take down the entire save.

import type { AutoFillResult } from "./analyze-item";
import {
  CATEGORIES,
  SUBCATEGORIES,
  PATTERNS,
  MATERIALS,
  FITS,
  BOTTOM_FITS,
  LENGTHS,
  PANTS_LENGTHS,
  WAIST_STYLES,
  WAIST_HEIGHTS,
  WAIST_CLOSURES,
  SHOE_HEIGHTS,
  HEEL_TYPES,
  SHOE_CLOSURES,
  BELT_STYLES,
  METAL_FINISHES,
  BAG_SIZES,
  DRESS_SILHOUETTES,
  TOE_SHAPES,
  NECKLINES,
  SLEEVE_LENGTHS,
  CLOSURES,
  FORMALITIES,
  SEASONS,
  OCCASIONS,
} from "./item-enums";

function oneOf<T extends string>(
  value: unknown,
  valid: readonly T[]
): T | undefined {
  if (typeof value !== "string") return undefined;
  const normalised = value.trim().toLowerCase().replace(/_/g, "-");
  return (valid as readonly string[]).includes(normalised)
    ? (normalised as T)
    : undefined;
}

function arrayOf<T extends string>(value: unknown, valid: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    const coerced = oneOf(v, valid);
    if (coerced && !out.includes(coerced)) out.push(coerced);
  }
  return out;
}

function hexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

export function sanitizeAutoFill(raw: unknown): AutoFillResult {
  const r = (raw ?? {}) as Record<string, unknown>;

  const colors: { hex: string; name: string }[] = [];
  if (Array.isArray(r.colors)) {
    for (const c of r.colors) {
      if (c && typeof c === "object") {
        const obj = c as Record<string, unknown>;
        const hex = hexColor(obj.hex);
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        if (hex) colors.push({ hex, name: name || "Color" });
      }
    }
  }

  const warmth =
    typeof r.warmth_rating === "number"
      ? Math.max(1, Math.min(5, Math.round(r.warmth_rating)))
      : undefined;

  return {
    name:
      typeof r.name === "string" && r.name.trim()
        ? r.name.trim().slice(0, 80)
        : undefined,
    category: oneOf(r.category, CATEGORIES),
    subcategory: oneOf(r.subcategory, SUBCATEGORIES),
    pattern: arrayOf(r.pattern, PATTERNS),
    material: arrayOf(r.material, MATERIALS),
    formality: arrayOf(r.formality, FORMALITIES),
    seasons: arrayOf(r.seasons, SEASONS),
    occasions: arrayOf(r.occasions, OCCASIONS),
    fit: oneOf(r.fit, FITS),
    bottom_fit: oneOf(r.bottom_fit, BOTTOM_FITS),
    length: oneOf(r.length, LENGTHS),
    pants_length: oneOf(r.pants_length, PANTS_LENGTHS),
    waist_style: oneOf(r.waist_style, WAIST_STYLES),
    waist_height: oneOf(r.waist_height, WAIST_HEIGHTS),
    waist_closure: oneOf(r.waist_closure, WAIST_CLOSURES),
    neckline: oneOf(r.neckline, NECKLINES),
    sleeve_length: oneOf(r.sleeve_length, SLEEVE_LENGTHS),
    closure: oneOf(r.closure, CLOSURES),
    shoe_height: oneOf(r.shoe_height, SHOE_HEIGHTS),
    heel_type: oneOf(r.heel_type, HEEL_TYPES),
    shoe_closure: oneOf(r.shoe_closure, SHOE_CLOSURES),
    belt_style: oneOf(r.belt_style, BELT_STYLES),
    metal_finish: oneOf(r.metal_finish, METAL_FINISHES),
    bag_size: oneOf(r.bag_size, BAG_SIZES),
    dress_silhouette: oneOf(r.dress_silhouette, DRESS_SILHOUETTES),
    toe_shape: oneOf(r.toe_shape, TOE_SHAPES),
    warmth_rating: warmth,
    rain_appropriate:
      typeof r.rain_appropriate === "boolean" ? r.rain_appropriate : undefined,
    is_layering_piece:
      typeof r.is_layering_piece === "boolean" ? r.is_layering_piece : undefined,
    belt_compatible:
      typeof r.belt_compatible === "boolean" ? r.belt_compatible : undefined,
    colors: colors.length > 0 ? colors : undefined,
  };
}
