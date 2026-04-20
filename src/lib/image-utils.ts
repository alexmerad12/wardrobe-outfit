// Client-side image helpers.

// Read EXIF orientation (tag 0x0112) out of a JPEG's header. Returns 1
// when there's no EXIF or the format isn't JPEG — 1 is the identity
// orientation, so callers can apply the transform unconditionally.
//
// createImageBitmap supports an imageOrientation: "from-image" flag,
// but it's inconsistently implemented across mobile browsers — Samsung
// Internet and some Chromium forks silently ignore it. Parsing the tag
// ourselves is ~40 lines and always works.
async function readExifOrientation(source: Blob): Promise<number> {
  if (!source.type.includes("jpeg") && !source.type.includes("jpg")) return 1;
  try {
    // 64 KB is more than enough for every EXIF block we've ever seen.
    const head = source.slice(0, 65536);
    const buffer = await head.arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4) return 1;
    if (view.getUint16(0) !== 0xffd8) return 1; // not a JPEG

    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xffe1) {
        // APP1 segment — the EXIF block
        if (view.getUint32(offset + 2) !== 0x45786966) return 1; // "Exif"
        const tiff = offset + 8;
        const little = view.getUint16(tiff) === 0x4949;
        const get16 = (o: number) => view.getUint16(o, little);
        const get32 = (o: number) => view.getUint32(o, little);
        const ifd0 = tiff + get32(tiff + 4);
        const count = get16(ifd0);
        for (let i = 0; i < count; i++) {
          const entry = ifd0 + 2 + i * 12;
          if (get16(entry) === 0x0112) {
            const value = get16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      const segmentLength = view.getUint16(offset);
      offset += segmentLength;
    }
  } catch {
    // Bad header, truncated file — identity is a safe default.
  }
  return 1;
}

// Apply an EXIF orientation value (1–8) by drawing the bitmap into the
// canvas with the right transform. Returns the canvas dimensions needed
// to hold the oriented image.
function applyOrientation(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  orientation: number,
  w: number,
  h: number
) {
  switch (orientation) {
    case 2: // flip horizontal
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // rotate 180
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      break;
    case 4: // flip vertical
      ctx.translate(0, h);
      ctx.scale(1, -1);
      break;
    case 5: // transpose
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // rotate 90 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -h);
      break;
    case 7: // transverse
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(w, -h);
      ctx.scale(-1, 1);
      break;
    case 8: // rotate 90 CCW
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-w, 0);
      break;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
}

// Shrink an image to a working size before feeding it to anything expensive
// (ML inference, Claude vision, network upload). Phone cameras routinely
// produce 12 MP HEIC/JPEG files that are:
//   - way bigger than Claude's 5 MB image limit (vision calls would 400)
//   - slow to upload to Supabase over cellular
//   - overkill for ISNet (it resizes to ~1 K internally anyway)
//
// Always transcodes — even when the source is already small enough — so
// we can guarantee EXIF orientation is baked into the pixels. A sideways
// phone photo with orientation=6 displays fine in <img> but loses its
// EXIF the moment anything re-encodes it (next/image, a canvas draw,
// Supabase storage fetched as bytes), so the rotation has to be applied
// now.
export async function downscaleImage(
  source: Blob | File,
  maxDimension = 1280
): Promise<Blob> {
  try {
    const orientation = await readExifOrientation(source);
    const swapAxes = orientation >= 5 && orientation <= 8;

    const bitmap = await createImageBitmap(source);
    const displayW = swapAxes ? bitmap.height : bitmap.width;
    const displayH = swapAxes ? bitmap.width : bitmap.height;
    const maxSide = Math.max(displayW, displayH);
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const outW = Math.round(displayW * scale);
    const outH = Math.round(displayH * scale);

    // The canvas is sized for the ORIENTED output. The internal draw
    // call is still in the bitmap's native coordinate system, so the
    // transform matrix has to use the pre-rotation width/height.
    const drawW = swapAxes ? outH : outW;
    const drawH = swapAxes ? outW : outH;

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

    applyOrientation(ctx, bitmap, orientation, drawW, drawH);
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
