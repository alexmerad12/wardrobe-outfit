// Shrink an image to a working size before feeding it to anything expensive
// (ML inference, Claude vision, network upload). Phone cameras routinely
// produce 12 MP HEIC/JPEG files that are:
//   - way bigger than Claude's 5 MB image limit (vision calls would 400)
//   - slow to upload to Supabase over cellular
//   - overkill for ISNet (it resizes to ~1 K internally anyway)
//
// NOTE on orientation: we deliberately DO NOT auto-rotate based on EXIF.
// Users are expected to upload their photos already oriented correctly —
// the app trusts the pixels as-is. Browsers still honour EXIF when
// rendering the raw file via <img>, but once it's canvas-drawn or
// shipped through imgly / Claude, EXIF is stripped. Leaving it alone
// avoids surprising "why did my photo flip?" cases.
// Composite a transparent-background blob (imgly's output) onto a
// pure-white canvas, auto-crop to the subject, re-center on a square
// canvas, and re-encode as JPEG. Three problems this addresses:
//
//   1. Halo/fringe: imgly leaves semi-transparent pixels at the edge
//      of the subject. When drawn on white, those pixels retain a
//      tint from the original background (dark fringe on dark bg
//      → visible grey halo). Snapping low-alpha pixels to white kills
//      the halo before the blend.
//   2. Off-centred subjects: the bg-removed image has the subject
//      wherever the user happened to frame it. A dress at the top-
//      right of the photo looks unbalanced in the wardrobe grid.
//      Finding the alpha bounding box and re-centering on a square
//      gives every item a consistent, balanced presentation.
//   3. File size: imgly's transparent PNGs routinely hit 2-3 MB on
//      1600 px inputs. Flattening onto white + JPEG encoding drops
//      that ~10× with no visible quality loss.
//
// If bbox detection fails (shouldn't happen but the canvas might not
// give us readable ImageData on some browsers / CORS edge cases), we
// fall back to the old direct-flatten path.
function createCanvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement("canvas"), { width: w, height: h });
}

async function encodeJpeg(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

export async function flattenOntoWhite(
  transparentBlob: Blob,
  maxDimension = 1280,
  quality = 0.88
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(transparentBlob);
    const srcW = bitmap.width;
    const srcH = bitmap.height;

    // Read pixel data so we can (a) clean the fringe and (b) find the
    // subject's bounding box.
    const workCanvas = createCanvas(srcW, srcH);
    const workCtx = (workCanvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!workCtx) {
      bitmap.close();
      return transparentBlob;
    }
    workCtx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = workCtx.getImageData(0, 0, srcW, srcH);
    const data = imageData.data;

    // Fringe cleanup: any pixel with alpha below FRINGE_CUT is almost
    // certainly the model's soft transition between subject and
    // background. Snapping those to opaque white removes the tinted
    // halo that was visible against the pure-white backdrop. Pixels
    // above the cut keep their alpha so the subject's true edge still
    // anti-aliases smoothly.
    const FRINGE_CUT = 120;
    const SUBJECT_CUT = 30; // anything below this is treated as bg for bbox
    let minX = srcW;
    let minY = srcH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const idx = (y * srcW + x) * 4;
        const a = data[idx + 3];
        if (a < FRINGE_CUT) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
          if (a >= SUBJECT_CUT) {
            // fringe was still close enough to count as subject
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    workCtx.putImageData(imageData, 0, 0);

    // Bbox sanity: if the model returned no subject (or a trivially
    // small one), fall back to the whole-frame flatten.
    const bboxValid =
      maxX >= 0 &&
      maxY >= 0 &&
      maxX - minX > 20 &&
      maxY - minY > 20;

    const outSize = maxDimension;
    const out = createCanvas(outSize, outSize);
    const outCtx = (out as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!outCtx) return transparentBlob;
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, outSize, outSize);

    if (bboxValid) {
      const bboxW = maxX - minX + 1;
      const bboxH = maxY - minY + 1;
      // 8% padding on each side so the subject never kisses the frame
      const padding = Math.round(outSize * 0.08);
      const innerSize = outSize - padding * 2;
      const scale = Math.min(innerSize / bboxW, innerSize / bboxH);
      const drawW = Math.round(bboxW * scale);
      const drawH = Math.round(bboxH * scale);
      const drawX = Math.round((outSize - drawW) / 2);
      const drawY = Math.round((outSize - drawH) / 2);
      outCtx.drawImage(
        workCanvas as unknown as CanvasImageSource,
        minX,
        minY,
        bboxW,
        bboxH,
        drawX,
        drawY,
        drawW,
        drawH
      );
    } else {
      const maxSide = Math.max(srcW, srcH);
      const scale = outSize / maxSide;
      const drawW = Math.round(srcW * scale);
      const drawH = Math.round(srcH * scale);
      const drawX = Math.round((outSize - drawW) / 2);
      const drawY = Math.round((outSize - drawH) / 2);
      outCtx.drawImage(
        workCanvas as unknown as CanvasImageSource,
        0,
        0,
        srcW,
        srcH,
        drawX,
        drawY,
        drawW,
        drawH
      );
    }

    return await encodeJpeg(out as OffscreenCanvas | HTMLCanvasElement, quality);
  } catch {
    // Last-ditch: return the original transparent blob. Upload will
    // still attempt it (probably fail on the large PNG size) but we
    // don't want a canvas edge case to kill the pipeline silently.
    return transparentBlob;
  }
}

export async function downscaleImage(
  source: Blob | File,
  maxDimension = 1280
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= maxDimension) {
      bitmap.close();
      return source;
    }
    const scale = maxDimension / maxSide;
    const outW = Math.round(bitmap.width * scale);
    const outH = Math.round(bitmap.height * scale);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(outW, outH)
        : Object.assign(document.createElement("canvas"), {
            width: outW,
            height: outH,
          });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close();
    if ("convertToBlob" in canvas) {
      return await (canvas as OffscreenCanvas).convertToBlob({
        type: "image/jpeg",
        quality: 0.82,
      });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
        "image/jpeg",
        0.82
      );
    });
  } catch {
    return source;
  }
}
