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
  // HEIC from iPhones is the big offender — desktop browsers won't render
  // it as an <img>, so even if the file is already small we still want to
  // transcode it to a format browsers understand.
  const isOpaqueFormat =
    source.type === "image/heic" || source.type === "image/heif";
  try {
    // imageOrientation: "from-image" makes the decoder honour EXIF rotation
    // metadata — without it, a photo taken sideways on a phone stays
    // sideways after upload, because the canvas draws the raw pixel data
    // and EXIF is stripped during re-encode.
    const bitmap = await createImageBitmap(source, {
      imageOrientation: "from-image",
    });
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= maxDimension && !isOpaqueFormat) {
      bitmap.close();
      // Fast-path skipped transcode would mean EXIF rotation is also
      // preserved (browsers render <img> with EXIF), so returning source
      // is fine here — only the downscale path strips it.
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
