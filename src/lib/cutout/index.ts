// Server-side background removal for wardrobe photos (replaces Photoroom,
// cancelled 2026-10, and the on-device imgly model that crashed 4 GB
// Android phones). Produces the catalog look every item gets: the garment
// cut out, cropped to itself and centred on a 1280 px white square with an
// 8 % margin, matching what flattenOntoWhite did on the client.

import sharp from "sharp";
import { alphaBox, compositeOnWhite, dropSpecks, logitsToMask, minLogits, mirrorPlane, mirrorRgb } from "./matte";
import { MODEL_INPUT_SIZE, predictLogits } from "./model";
import { oneAtATime } from "./one-at-a-time";

const WORK_MAX = 1600; // longest side the matte is computed at
const OUT_SIZE = 1280;
const PADDING = 0.08;
const MAX_UPSCALE = 2;

export type CutoutResult = {
  jpeg: Buffer;
  timings: { waitMs: number; decodeMs: number; modelMs: number; matteMs: number; encodeMs: number };
};

// One photo at a time per instance, from decode to JPEG, not only the model
// run. The model keeps every core busy, so a photo's matte and encode used to
// crawl beside the next photo's model run: on 2026-10-16 three photos of one
// bulk upload, sent to the same instance by Fluid compute, all came back
// together after ~81 s (a 1 s matte took 22 s, a 0.4 s encode 23 s).
const enqueue = oneAtATime();

/**
 * Remove the background from a photo and return the catalog JPEG, or null
 * when the model finds no clear subject (caller keeps the plain photo).
 * Throws on undecodable input or model failure.
 */
export function cutoutToCatalogJpeg(input: Buffer): Promise<CutoutResult | null> {
  return enqueue((waitMs) => cutout(input, waitMs));
}

async function cutout(input: Buffer, waitMs: number): Promise<CutoutResult | null> {
  const t0 = performance.now();
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: WORK_MAX, height: WORK_MAX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const rgb = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const modelInput = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const t1 = performance.now();

  // Mirror pass (owner's choice, 2026-10-17): the model also runs on the
  // mirrored photo and a pixel stays only as far as both runs keep it. On
  // the 12 reference photos it matched Photoroom at least as well as one run
  // on every photo, and removed most of a white tee's cast shadow (97.5% ->
  // 98.6%). It doubles the model time (~24 s a photo on 2 vCPUs).
  const pixels = new Uint8Array(modelInput.buffer, modelInput.byteOffset, modelInput.byteLength);
  const S = MODEL_INPUT_SIZE;
  const direct = await predictLogits(pixels);
  const mirrored = mirrorPlane(await predictLogits(mirrorRgb(pixels, S, S)), S, S);
  const logits = minLogits(direct, mirrored);
  const t2 = performance.now();

  const mask1024 = logitsToMask(logits);
  // extractChannel: sharp writes a resized 1-channel image back out as
  // 3-channel sRGB by default, which silently triples the stride.
  const alphaBuf = await sharp(mask1024, { raw: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 1 } })
    .resize(w, h, { fit: "fill", kernel: "cubic" })
    .extractChannel(0)
    .raw()
    .toBuffer();
  if (alphaBuf.length !== w * h || rgb.length !== w * h * 3) {
    throw new Error(`cutout buffer size mismatch: rgb ${rgb.length}, alpha ${alphaBuf.length}, ${w}x${h}`);
  }
  const alpha = new Uint8Array(alphaBuf.buffer, alphaBuf.byteOffset, alphaBuf.byteLength);
  dropSpecks(alpha, w, h);
  const box = alphaBox(alpha, w, h);
  // No subject, or a speck covering under 1 % of the frame: not a cutout
  // anyone would want as their wardrobe photo.
  if (!box || box.width * box.height < w * h * 0.01) return null;
  const composite = compositeOnWhite(rgb, alpha, w, h);
  const t3 = performance.now();

  // Crop 2 px outside the box so no faint edge pixel is clipped.
  const left = Math.max(0, box.left - 2);
  const top = Math.max(0, box.top - 2);
  const cropW = Math.min(w - left, box.width + 4);
  const cropH = Math.min(h - top, box.height + 4);
  const inner = OUT_SIZE * (1 - 2 * PADDING);
  const scale = Math.min(inner / cropW, inner / cropH, MAX_UPSCALE);
  const drawW = Math.max(1, Math.round(cropW * scale));
  const drawH = Math.max(1, Math.round(cropH * scale));
  const subject = await sharp(composite, { raw: { width: w, height: h, channels: 3 } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize(drawW, drawH, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const jpeg = await sharp({
    create: { width: OUT_SIZE, height: OUT_SIZE, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: subject, left: Math.round((OUT_SIZE - drawW) / 2), top: Math.round((OUT_SIZE - drawH) / 2) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const t4 = performance.now();

  return {
    jpeg,
    timings: {
      waitMs,
      decodeMs: Math.round(t1 - t0),
      modelMs: Math.round(t2 - t1),
      matteMs: Math.round(t3 - t2),
      encodeMs: Math.round(t4 - t3),
    },
  };
}
