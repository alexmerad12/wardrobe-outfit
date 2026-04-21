import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Returns a short-lived signed upload URL. The client PUTs the file
// bytes DIRECTLY to Supabase Storage using this URL — the file never
// passes through our Vercel function.
//
// Why this exists: the previous server-proxied upload route
// (/api/upload) was ingesting every file into a Vercel serverless
// function's memory, then re-uploading to Supabase. That pattern ran
// into two real failures:
//   - Vercel's 10 s (Hobby) / 60 s (Pro) function timeout, which a
//     4 MB mobile upload through a buffering proxy hit routinely
//     when network quality dipped.
//   - Memory pressure under concurrent uploads (each request held
//     the full file buffer in RAM at once).
// Supabase is purpose-built for direct uploads. The signed URL
// approach moves the file transfer off our critical path entirely.

const BUCKET = "clothing-images";

type SignBody = {
  filename?: string;
  contentType?: string;
};

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  let body: SignBody = {};
  try {
    body = (await request.json()) as SignBody;
  } catch {
    // Body is optional — filename + contentType are used only to
    // produce a tidy storage path. Callers that POST without a body
    // get reasonable defaults.
  }

  const contentType = body.contentType || "image/jpeg";
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
      ? "webp"
      : "jpg";
  const originalName = body.filename || "item";
  const safeBase =
    originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 40) || "item";
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[upload/sign] createSignedUploadUrl failed", {
      path,
      error: error?.message,
    });
    return NextResponse.json(
      { error: error?.message || "Sign failed" },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: publicUrlData.publicUrl,
  });
}
