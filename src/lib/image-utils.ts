// Client-side image helpers.

// Shrink an image to a working size before feeding it to anything expensive
// (ML inference, Claude vision, network upload). Phone cameras routinely
// produce 12 MP HEIC/JPEG files that are:
//   - way bigger than Claude's 5 MB image limit (vision calls would 400)
//   - slow to upload to Supabase over cellular
//   - overkill for ISNet (it resizes to ~1 K internally anyway)
//
// Returns the original blob unchanged if it's already small enough, or we
// can't decode it (older format, broken file) — callers decide what to do.
export async function downscaleImage(
  source: Blob | File,
  maxDimension = 1600
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= maxDimension) {
      bitmap.close();
      return source;
    }
    const scale = maxDimension / maxSide;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    if ("convertToBlob" in canvas) {
      return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality: 0.92 });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
        "image/jpeg",
        0.92
      );
    });
  } catch {
    return source;
  }
}
