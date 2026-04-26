import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Server-side image normalization endpoint. The bulk and single-add
// pipelines both rely on the browser's createImageBitmap + canvas to
// decode + resize photos, but mobile Chrome silently fails on:
//   - Samsung HEIF files with the bare "mif1" brand (libheif chokes too)
//   - Samsung "Motion Photo" JPEG+MP4 hybrids over Mali GPU dimension caps
//   - Memory-pressured 12 MP bitmaps after a few sequential bulk uploads
//   - Anything > 4096 px on older Mali / Adreno GPUs
//
// Sharp on the server doesn't have those problems — it links libvips
// statically, decodes JPEG/PNG/WebP/AVIF/HEIF natively, and runs in
// Node memory which is much larger than mobile Chrome's heap.
//
// This endpoint is the last-resort fallback: when client-side decode
// fails, we POST the raw bytes here, sharp decodes + resizes + re-
// encodes as clean 1280 px JPEG, and we return the JPEG bytes for the
// pipeline to upload via the normal path.

export const maxDuration = 30; // sharp on a 20 MB HEIF can take a few seconds

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[normalize] formData parse failed", err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const file = formData.get("image");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const output = await sharp(inputBuffer, { failOn: "none" })
      .rotate() // honor EXIF orientation
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(output.byteLength),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[normalize] sharp decode failed", detail);
    return NextResponse.json(
      {
        error: "Couldn't decode this image",
        detail: detail.slice(0, 300),
      },
      { status: 422 }
    );
  }
}
