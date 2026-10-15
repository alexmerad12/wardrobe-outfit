// Shrink an image to a working size before sending it anywhere expensive
// (AI vision calls, network upload). Phone cameras routinely produce
// 12 MP HEIC/JPEG files that are slow to upload over cellular and far more
// detail than clothing classification needs.
//
// NOTE on orientation: we deliberately DO NOT auto-rotate based on EXIF.
// Browsers honour EXIF when drawing the file, and the server-side sharp
// pipelines call .rotate() themselves.
//
// Background removal no longer happens in the browser: it runs on the
// server (/api/items/normalize, src/lib/cutout), so the old client-side
// flatten/cutout helpers that lived here are gone.
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
