"use client";

import { useMemo } from "react";
import { useLocale } from "./use-locale";
import type {
  Category,
  Subcategory,
  Pattern,
  Material,
  Fit,
  BottomFit,
  Length,
  PantsLength,
  WaistStyle,
  WaistHeight,
  WaistClosure,
  ShoeHeight,
  HeelType,
  ShoeClosure,
  BeltPosition,
  BeltStyle,
  MetalFinish,
  BagSize,
  DressSilhouette,
  Neckline,
  SleeveLength,
  Closure,
  Formality,
  Season,
  Occasion,
  Mood,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  SUBCATEGORY_OPTIONS,
  PATTERN_LABELS,
  MATERIAL_LABELS,
  FIT_LABELS,
  BOTTOM_FIT_LABELS,
  LENGTH_LABELS,
  PANTS_LENGTH_LABELS,
  WAIST_STYLE_LABELS,
  WAIST_HEIGHT_LABELS,
  WAIST_CLOSURE_LABELS,
  SHOE_HEIGHT_LABELS,
  HEEL_TYPE_LABELS,
  SHOE_CLOSURE_LABELS,
  BELT_POSITION_LABELS,
  BELT_STYLE_LABELS,
  METAL_FINISH_LABELS,
  BAG_SIZE_LABELS,
  DRESS_SILHOUETTE_LABELS,
  NECKLINE_LABELS,
  SLEEVE_LENGTH_LABELS,
  CLOSURE_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  OCCASION_LABELS,
} from "@/lib/types";

/**
 * Returns translated versions of the constant label maps from types.ts.
 *
 * Use this in any component that was importing the raw *_LABELS objects and
 * iterating over them — you get the same shape, but each value is the
 * translation in the user's current locale instead of the hardcoded English.
 *
 * Keys are unchanged, so switch-case logic and lookups keep working.
 */
export function useLabels() {
  const { t, tMood } = useLocale();

  return useMemo(() => {
    function mapKeys<T extends string>(
      source: Record<T, string> | Record<string, string>,
      namespace: string
    ): Record<T, string> {
      const out = {} as Record<T, string>;
      for (const key of Object.keys(source) as T[]) {
        out[key] = t(`${namespace}.${key}`);
      }
      return out;
    }

    const subcategoryOptions: Record<Category, { value: Subcategory; label: string }[]> = {
      top: [],
      bottom: [],
      dress: [],
      "one-piece": [],
      outerwear: [],
      shoes: [],
      bag: [],
      accessory: [],
    };
    for (const cat of Object.keys(SUBCATEGORY_OPTIONS) as Category[]) {
      subcategoryOptions[cat] = SUBCATEGORY_OPTIONS[cat].map((opt) => ({
        value: opt.value,
        label: t(`subcategory.${opt.value}`),
      }));
    }

    return {
      CATEGORY: mapKeys<Category>(CATEGORY_LABELS, "category"),
      SUBCATEGORY_OPTIONS: subcategoryOptions,
      PATTERN: mapKeys<Pattern>(PATTERN_LABELS, "pattern"),
      MATERIAL: mapKeys<Material>(MATERIAL_LABELS, "material"),
      FIT: mapKeys<Fit>(FIT_LABELS, "fit"),
      BOTTOM_FIT: mapKeys<BottomFit>(BOTTOM_FIT_LABELS, "bottomFit"),
      LENGTH: mapKeys<Length>(LENGTH_LABELS, "length"),
      PANTS_LENGTH: mapKeys<PantsLength>(PANTS_LENGTH_LABELS, "pantsLength"),
      WAIST_STYLE: mapKeys<WaistStyle>(WAIST_STYLE_LABELS, "waistStyle"),
      WAIST_HEIGHT: mapKeys<WaistHeight>(WAIST_HEIGHT_LABELS, "waistHeight"),
      WAIST_CLOSURE: mapKeys<WaistClosure>(WAIST_CLOSURE_LABELS, "waistClosure"),
      SHOE_HEIGHT: mapKeys<ShoeHeight>(SHOE_HEIGHT_LABELS, "shoeHeight"),
      HEEL_TYPE: mapKeys<HeelType>(HEEL_TYPE_LABELS, "heelType"),
      SHOE_CLOSURE: mapKeys<ShoeClosure>(SHOE_CLOSURE_LABELS, "shoeClosure"),
      BELT_POSITION: mapKeys<BeltPosition>(BELT_POSITION_LABELS, "beltPosition"),
      BELT_STYLE: mapKeys<BeltStyle>(BELT_STYLE_LABELS, "beltStyle"),
      METAL_FINISH: mapKeys<MetalFinish>(METAL_FINISH_LABELS, "metalFinish"),
      BAG_SIZE: mapKeys<BagSize>(BAG_SIZE_LABELS, "bagSize"),
      DRESS_SILHOUETTE: mapKeys<DressSilhouette>(DRESS_SILHOUETTE_LABELS, "dressSilhouette"),
      NECKLINE: mapKeys<Neckline>(NECKLINE_LABELS, "neckline"),
      SLEEVE_LENGTH: mapKeys<SleeveLength>(SLEEVE_LENGTH_LABELS, "sleeveLength"),
      CLOSURE: mapKeys<Closure>(CLOSURE_LABELS, "closure"),
      FORMALITY: mapKeys<Formality>(FORMALITY_LABELS, "formality"),
      SEASON: mapKeys<Season>(SEASON_LABELS, "season"),
      OCCASION: mapKeys<Occasion>(OCCASION_LABELS, "occasion"),
      MOOD_LABEL: (mood: Mood) => tMood(mood, "label"),
      MOOD_DESCRIPTION: (mood: Mood) => tMood(mood, "description"),
    };
  }, [t, tMood]);
}
