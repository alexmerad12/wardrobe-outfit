// Client helper to call /api/items/analyze. Used by the add-item page to
// AI-pre-fill the form the moment the user uploads a photo.

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
  BeltStyle,
  MetalFinish,
  Neckline,
  SleeveLength,
  Closure,
  Formality,
  Season,
  Occasion,
} from "./types";

export type AutoFillResult = {
  name?: string;
  category?: Category;
  subcategory?: Subcategory;
  pattern?: Pattern[];
  material?: Material[];
  formality?: Formality[];
  seasons?: Season[];
  occasions?: Occasion[];
  fit?: Fit;
  bottom_fit?: BottomFit;
  length?: Length;
  pants_length?: PantsLength;
  waist_style?: WaistStyle;
  waist_height?: WaistHeight;
  waist_closure?: WaistClosure;
  neckline?: Neckline;
  sleeve_length?: SleeveLength;
  closure?: Closure;
  shoe_height?: ShoeHeight;
  heel_type?: HeelType;
  shoe_closure?: ShoeClosure;
  belt_style?: BeltStyle;
  metal_finish?: MetalFinish;
  warmth_rating?: number;
  rain_appropriate?: boolean;
  is_layering_piece?: boolean;
  belt_compatible?: boolean;
  colors?: { hex: string; name: string }[];
};

export async function analyzeItem(image: Blob): Promise<AutoFillResult> {
  const body = new FormData();
  body.append("image", image);
  const res = await fetch("/api/items/analyze", { method: "POST", body });
  if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
  return (await res.json()) as AutoFillResult;
}
