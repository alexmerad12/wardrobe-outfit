// Pure pixel math for the self-hosted background removal. No I/O here, so
// every step is unit-testable and the route only wires model + sharp.
//
// Pipeline (see ./index.ts): model logits -> alpha mask -> drop stray
// specks -> estimate true foreground colours -> composite on white.
//
// Why the foreground step exists: along an edge the model gives partial
// alpha (hair-thin fringe, knit fuzz, lace). Those pixels in the ORIGINAL
// photo are a mix of garment + door/floor colour, so blending them onto
// white leaves a grey or brown halo. Blur-fusion foreground estimation
// (Forte & Pitie 2021, the method Photoroom open-sourced as
// fast-foreground-estimation) recovers the garment colour for those
// pixels so the edge blends cleanly into white. The old client path
// (image-utils.ts flattenOntoWhite) avoided the halo by snapping alpha to
// 0/1, which leaves jagged stair-step edges instead.

export type Box = { left: number; top: number; width: number; height: number };

/** Model logits (1 per pixel) to an 8-bit alpha mask. */
export function logitsToMask(logits: ArrayLike<number>): Uint8Array {
  const mask = new Uint8Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const p = 1 / (1 + Math.exp(-logits[i]));
    mask[i] = Math.round(p * 255);
  }
  return mask;
}

/**
 * Remove disconnected specks the model picked up from the background (a
 * door knob, a fleck on the floor). Components are found on alpha >= 16
 * with 8-connectivity; a component survives when it is at least 3 % of
 * the largest one, so a PAIR of shoes or a belt and its loose buckle both
 * stay. Faint haze below alpha 8 is zeroed everywhere. Mutates `alpha`.
 */
export function dropSpecks(alpha: Uint8Array, w: number, h: number): void {
  const n = w * h;
  const label = new Int32Array(n); // 0 = unvisited/background
  const stack = new Int32Array(n);
  const areas: number[] = [0];
  let next = 1;
  for (let start = 0; start < n; start++) {
    if (alpha[start] < 16 || label[start] !== 0) continue;
    const id = next++;
    let area = 0;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (label[q] === 0 && alpha[q] >= 16) {
            label[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    areas.push(area);
  }
  if (next === 1) return;
  const largest = Math.max(...areas);
  const minArea = largest * 0.03;
  for (let i = 0; i < n; i++) {
    const l = label[i];
    if (l !== 0 && areas[l] < minArea) alpha[i] = 0;
    else if (alpha[i] < 8) alpha[i] = 0;
  }
}

/** Bounding box of pixels with alpha >= threshold, or null when empty. */
export function alphaBox(alpha: Uint8Array, w: number, h: number, threshold = 32): Box | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Normalized box filter with a k x k window (same window as OpenCV's
 * cv2.blur), separable, O(1) per pixel via prefix sums. Near the border the
 * mean is over the pixels that exist, so edges don't darken.
 */
export function boxBlur(src: Float32Array, w: number, h: number, k: number): Float32Array {
  const r1 = Math.floor(k / 2);
  const r2 = k - 1 - r1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // Horizontal pass: prefix sums along each row.
  const prefix = new Float64Array(w + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    prefix[0] = 0;
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = x - r1 < 0 ? 0 : x - r1;
      const hi = x + r2 >= w ? w - 1 : x + r2;
      tmp[row + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  // Vertical pass: a sliding window of whole rows, so memory is read in
  // order instead of striding down columns.
  const acc = new Float64Array(w);
  let lo = 0;
  let hi = Math.min(h - 1, r2);
  for (let y = lo; y <= hi; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[row + x];
  }
  for (let y = 0; y < h; y++) {
    const inv = 1 / (hi - lo + 1);
    const row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = acc[x] * inv;
    const nextHi = Math.min(h - 1, y + 1 + r2);
    const nextLo = Math.max(0, y + 1 - r1);
    if (nextHi > hi) {
      const add = nextHi * w;
      for (let x = 0; x < w; x++) acc[x] += tmp[add + x];
      hi = nextHi;
    }
    if (nextLo > lo) {
      const sub = lo * w;
      for (let x = 0; x < w; x++) acc[x] -= tmp[sub + x];
      lo = nextLo;
    }
  }
  return out;
}

/** One blur-fusion step. Planar float channels in [0, 1]. */
function blurFusion(
  image: Float32Array[],
  fg: Float32Array[],
  bg: Float32Array[],
  a: Float32Array,
  w: number,
  h: number,
  k: number
): { fg: Float32Array[]; blurredBg: Float32Array[] } {
  const n = w * h;
  const blurredA = boxBlur(a, w, h, k);
  const outFg: Float32Array[] = [];
  const blurredBg: Float32Array[] = [];
  const work = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) work[i] = fg[c][i] * a[i];
    const bFA = boxBlur(work, w, h, k);
    for (let i = 0; i < n; i++) work[i] = bg[c][i] * (1 - a[i]);
    const bB1A = boxBlur(work, w, h, k);
    const f = new Float32Array(n);
    const bB = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const fBlur = bFA[i] / (blurredA[i] + 1e-5);
      const bBlur = bB1A[i] / (1 - blurredA[i] + 1e-5);
      const ai = a[i];
      const v = fBlur + ai * (image[c][i] - ai * fBlur - (1 - ai) * bBlur);
      f[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      bB[i] = bBlur;
    }
    outFg.push(f);
    blurredBg.push(bB);
  }
  return { fg: outFg, blurredBg };
}

/**
 * Composite the photo onto pure white using estimated foreground colours.
 * `rgb` is interleaved 8-bit RGB, `alpha` 8-bit, both w x h. Returns
 * interleaved 8-bit RGB. Two blur-fusion passes (k = 90 then 6), the
 * schedule used by BiRefNet's own refine_foreground.
 */
export function compositeOnWhite(rgb: Uint8Array, alpha: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const image = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    image[0][i] = rgb[i * 3] / 255;
    image[1][i] = rgb[i * 3 + 1] / 255;
    image[2][i] = rgb[i * 3 + 2] / 255;
    a[i] = alpha[i] / 255;
  }
  const pass1 = blurFusion(image, image, image, a, w, h, 90);
  const pass2 = blurFusion(image, pass1.fg, pass1.blurredBg, a, w, h, 6);
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    for (let c = 0; c < 3; c++) {
      // Fully opaque pixels keep their exact original colour; estimated
      // colour is only used where the mask is soft.
      const f = ai >= 0.999 ? image[c][i] : pass2.fg[c][i];
      const v = f * ai + (1 - ai);
      out[i * 3 + c] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
    }
  }
  return out;
}
