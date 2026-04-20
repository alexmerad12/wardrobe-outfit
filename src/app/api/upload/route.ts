import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Simple server-proxied upload. Client POSTs multipart FormData with a
// single `file` field; server pushes it straight to Supabase Storage
// and returns the public URL.
//
// Why this vs. direct client → Supabase tus:
//   - Mobile cellular is unreliable for long-lived tus protocol chatter,
//     especially on batches of ~5 photos. We kept getting items that
//     silently hung in the "processing" state because tus's retry
//     ladder waited ~3 minutes per file before giving up.
//   - Supabase tier with our setup only accepts 6 MB tus chunks, so even
//     a 500 KB photo goes through the full chunk-upload dance.
//   - A single multipart POST from the client + a single Supabase
//     upload call on the server is both faster and easier to reason
//     about. If the POST fails, we fail FAST and surface the error.
//
// Size: the client downscales to 1280 px JPEG @ 0.82 quality (~200-500
// KB) before hitting this endpoint. Well under Vercel's default 4.5 MB
// body limit.

const BUCKET = "clothing-images";

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[upload] formData parse failed", err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const originalName =
    "name" in file && typeof (file as File).name === "string"
      ? (file as File).name
      : "upload";
  const contentType = file.type || "image/jpeg";
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
      ? "webp"
      : "jpg";
  const safeBase = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40) || "item";
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType });

  if (error) {
    console.error("[upload] supabase upload failed", {
      path,
      size: buffer.byteLength,
      type: contentType,
      message: error.message,
    });
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
