import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { PHOTO_BUCKET, isOwnPhotoPath } from "@/lib/item-photos";
import { removeUnusedPhotos } from "@/lib/remove-photos";

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

  // Current clients name the upload once (src/lib/upload-to-supabase.ts) and
  // send that name with every attempt, so a retry overwrites its own earlier
  // attempt instead of leaving a second copy in storage. Older clients send
  // no name: make one up, as before.
  const requested = formData.get("path");
  let path: string;
  let upsert = false;
  if (typeof requested === "string" && requested) {
    if (!isOwnPhotoPath(userId, requested)) {
      return NextResponse.json({ error: "Bad upload path" }, { status: 400 });
    }
    path = requested;
    upsert = true;
  } else {
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
    path = `${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType, upsert });

  if (error) {
    console.error("[upload] supabase upload failed", {
      size: buffer.byteLength,
      type: contentType,
      message: error.message,
    });
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

// An upload a screen won't save: a photo replaced by another pick, left
// behind when the screen closed, or a bulk photo that failed or was
// cancelled. Removed unless a piece of the caller's points at it by now
// (src/lib/unsaved-uploads.ts decides when to ask; this route re-checks).
export async function DELETE(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const body = await readJsonObject(request);
  if (isNextResponse(body)) return body;
  const path = typeof body.path === "string" ? body.path : "";
  if (!isOwnPhotoPath(userId, path)) {
    return NextResponse.json({ error: "Not an upload of yours" }, { status: 400 });
  }

  const result = await removeUnusedPhotos(supabase, userId, [path]);
  if (result.error) {
    return NextResponse.json({ error: "Couldn't remove the upload" }, { status: 500 });
  }
  return NextResponse.json({ removed: result.removed });
}
