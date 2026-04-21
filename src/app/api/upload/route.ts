import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Fallback upload route. The PRIMARY path is direct client →
// Supabase via signed URL (see /api/upload/sign and
// src/lib/upload-to-supabase.ts). That path is faster and doesn't
// spend our Vercel function budget on file bytes. But it makes a
// cross-origin PUT to Supabase, and at least one user on Samsung
// Internet Browser consistently sees "XHR network error (no bytes
// sent)" on batch 2+ — i.e. the browser refuses to make the request
// because the preflight CORS check fails. Switching fetch ↔ XHR
// didn't help; the preflight layer itself is what's poisoned on that
// device.
//
// This route is the bypass: client POSTs multipart FormData to our
// own origin (no CORS involved at all), we re-upload to Supabase
// server-to-server (also no CORS), and return the URL. It costs a
// Vercel serverless invocation per upload and can time out on
// genuinely slow networks (Hobby tier: 10 s, Pro tier: 60 s), but
// for users who can't use the direct path it's the difference
// between the feature working and not.

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
  const safeBase =
    originalName
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
