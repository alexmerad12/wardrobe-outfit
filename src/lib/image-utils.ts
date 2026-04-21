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
// pure-white canvas and re-encode as JPEG. Imgly produces PNGs that
// routinely land at 2-3 MB on a 1600 px image because transparency
// defeats JPEG-style entropy coding, and that size is what was
// starving the upload pipeline on flaky mobile networks. For
// wardrobe photos we don't actually want transparency — every
// consumer of the image (wardrobe grid, outfit suggestions, review
// wizard) displays it on a light background anyway. Baking in white
// drops the file size ~10x with no visible quality loss.
export async function flattenOntoWhite(
  transparentBlob: Blob,
  maxDimension = 1280,
  quality = 0.88
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(transparentBlob);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
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
      return transparentBlob;
    }
    // Paint a solid white backdrop BEFORE drawing the subject so
    // transparent pixels become white rather than black (which is
    // what canvases default to for uninitialised pixels in some
    // browsers).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close();
    if ("convertToBlob" in canvas) {
      return await (canvas as OffscreenCanvas).convertToBlob({
        type: "image/jpeg",
        quality,
      });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
        "image/jpeg",
        quality
      );
    });
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
