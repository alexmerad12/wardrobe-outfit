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
