import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Server-side image normalization endpoint. Falls back here when
// client-side createImageBitmap can't decode the source (Samsung HEIF
// "mif1" variants, Mali GPU > 4096 px caps, memory pressure on 12 MP+
// shots). Sharp on the server has none of those constraints.
//
// IMPORTANT: this endpoint takes a Supabase Storage URL, not raw
// bytes. Vercel functions cap the request body at 4.5 MB at the edge
// layer; phone photos are routinely 5-7 MB so the multipart approach
// got rejected before sharp could run. Instead, the client uploads
// the raw original to Supabase directly (which has a 50 MB limit),
// then tells us "go fetch this URL and overwrite it with a clean
// 1280px JPEG". Server downloads, normalizes via sharp, writes back
// to the same path, returns the URL so the client can use it as the
// final image_url in its DB save.

export const maxDuration = 60;

const BUCKET = "clothing-images";

// Photoroom's API typically responds in 1-3s. Cap at 20s so a slow
// queue / rate-limit / temporary outage on their end falls back to
// plain sharp resize instead of timing out the whole Vercel function
// (which previously surfaced as "normalize 504" on every item).
const PHOTOROOM_TIMEOUT_MS = 20_000;

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  let body: { sourceUrl?: string; sourcePath?: string };
  try {
    body = (await request.json()) as { sourceUrl?: string; sourcePath?: string };
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { sourceUrl, sourcePath } = body;
  if (!sourceUrl || !sourcePath) {
    return NextResponse.json({ error: "Missing sourceUrl or sourcePath" }, { status: 400 });
  }

  // Path safety: ensure the user can only normalize their own uploads.
  // sourcePath is in the form `${userId}/${...}`.
  if (!sourcePath.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
  }

  // Fetch the original from Supabase Storage. 15s timeout — Vercel ↔
  // Supabase is usually <500ms but a cold connection can take a few
  // seconds and we want to fail loudly if it ever stalls.
  let inputBuffer: Buffer;
  try {
    const fetchAc = new AbortController();
    const fetchTimer = setTimeout(() => fetchAc.abort(), 15_000);
    try {
      const fetchRes = await fetch(sourceUrl, { signal: fetchAc.signal });
      if (!fetchRes.ok) {
        return NextResponse.json(
          { error: `Couldn't fetch source: ${fetchRes.status}` },
          { status: 502 }
        );
      }
      inputBuffer = Buffer.from(await fetchRes.arrayBuffer());
    } finally {
      clearTimeout(fetchTimer);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Source fetch failed", detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  // Try Photoroom for background removal first. If it works, we get
  // back a transparent PNG that sharp flattens onto white. If it fails
  // (no key, network error, quota, slow under load), fall back to
  // plain sharp resize — user keeps the original background but the
  // upload still works.
  let bgRemovedPng: Buffer | null = null;
  if (process.env.PHOTOROOM_API_KEY) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PHOTOROOM_TIMEOUT_MS);
    try {
      const fd = new FormData();
      fd.append("image_file", new Blob([new Uint8Array(inputBuffer)]), "input.jpg");
      const prRes = await fetch("https://sdk.photoroom.com/v1/segment", {
        method: "POST",
        headers: { "x-api-key": process.env.PHOTOROOM_API_KEY },
        body: fd,
        signal: ac.signal,
      });
      if (prRes.ok) {
        bgRemovedPng = Buffer.from(await prRes.arrayBuffer());
      } else {
        const errBody = await prRes.text().catch(() => "");
        console.warn(`[normalize] Photoroom failed ${prRes.status}: ${errBody.slice(0, 200)} — falling back to plain resize`);
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        console.warn(`[normalize] Photoroom timed out after ${PHOTOROOM_TIMEOUT_MS}ms — falling back to plain resize`);
      } else {
        console.warn("[normalize] Photoroom call threw — falling back to plain resize", err);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // Sharp processing: if Photoroom gave us a transparent PNG, flatten
  // onto white. Otherwise just resize the original. Either way, output
  // is a clean 1280px JPEG.
  let output: Buffer;
  try {
    if (bgRemovedPng) {
      output = await sharp(bgRemovedPng, { failOn: "none" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: 1280,
          height: 1280,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } else {
      output = await sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    }
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[normalize] sharp decode failed", detail);
    return NextResponse.json(
      { error: "Couldn't decode this image", detail: detail.slice(0, 300) },
      { status: 422 }
    );
  }

  // Overwrite the original at the same path with the normalized JPEG.
  // upsert:true so this replaces in place; same URL, new (smaller, JPEG)
  // bytes. The client uses the same URL as final image_url in DB.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(sourcePath, output, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: "Re-upload failed", detail: uploadErr.message },
      { status: 500 }
    );
  }

  // Cache-bust the URL we return. The client uploaded the raw bytes
  // to this same path right before calling us; their browser cache
  // still has those raw bytes keyed against this URL. Without a
  // version query param, the wardrobe view will show the original
  // (unprocessed) image until the cache expires.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(sourcePath);
  const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;
  return NextResponse.json({
    url: cacheBustedUrl,
    bytes: output.byteLength,
  });
}
