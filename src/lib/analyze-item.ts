// Client helper to call /api/items/analyze. Used by the add-item page to
// AI-pre-fill the form the moment the user uploads a photo.

import { downscaleImage } from "./image-utils";
import { convertHeicToJpeg, isHeicFileDeep } from "./heic-convert";
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
  BagSize,
  BagTexture,
  HatTexture,
  SunglassesStyle,
  DressSilhouette,
  ToeShape,
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
  bag_size?: BagSize;
  bag_texture?: BagTexture;
  hat_texture?: HatTexture;
  sunglasses_style?: SunglassesStyle;
  dress_silhouette?: DressSilhouette;
  toe_shape?: ToeShape;
  warmth_rating?: number;
  rain_appropriate?: boolean;
  is_layering_piece?: boolean;
  belt_compatible?: boolean;
  colors?: { hex: string; name: string }[];
};

export async function analyzeItem(image: Blob): Promise<AutoFillResult> {
  // HEIC → JPEG first if needed. Without this, Chrome's canvas can't
  // decode HEIC and downscaleImage silently passes the raw HEIC bytes
  // through; the analyze server then can't decode them either.
  let renderable: Blob = image;
  if (image instanceof File && (await isHeicFileDeep(image))) {
    renderable = await convertHeicToJpeg(image);
  }
  // Downscale before upload — raw phone photos are 5-10MB which blow
  // past Vercel's 4.5MB function-body limit (failing with "Body
  // exceeded limit" or just hanging on slow mobile networks). 1280 px
  // is plenty for clothing classification and lands under 1 MB JPEG.
  const downscaled = await downscaleImage(renderable, 1280);
  const body = new FormData();
  body.append("image", downscaled);
  const res = await fetch("/api/items/analyze", { method: "POST", body });
  if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
  return (await res.json()) as AutoFillResult;
}
