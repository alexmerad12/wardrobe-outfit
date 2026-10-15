import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { requireActiveSubscription } from "@/lib/require-subscription";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";
import { cutoutToCatalogJpeg } from "@/lib/cutout";
import { PHOTO_BUCKET, downloadOwnedPhoto, ownedPhotoPath } from "@/lib/owned-photo";

// Server-side image normalization + background removal for every wardrobe
// photo. The client uploads the original to Supabase Storage (phone photos
// blow Vercel's 4.5 MB body limit), then sends us its storage path. We read
// it back through the storage API, cut the garment out with the self-hosted
// model (src/lib/cutout: BiRefNet-lite, MIT, replaced Photoroom 2026-10),
// and overwrite the same path with a 1280 px catalog JPEG on white.
//
// If background removal fails (model download, decode edge case) or finds
// no subject, the photo is still normalized to a plain 1280 px JPEG, so an
// upload never fails just because the cutout did.

// Cold start downloads the model (183 MB) and builds the session before the
// inference (~20 s on 2 local cores, longer on one Vercel vCPU). Runs are
// serialized per instance, and Fluid compute can send a bulk upload's 3
// concurrent photos to the same instance, so the last one waits for the
// other two: 300 s covers a cold start plus a full queue.
export const maxDuration = 300;

const BUCKET = PHOTO_BUCKET;
// Counts every processed photo, retries included. Bulk upload is 10 per
// batch, so 60 is six full batches a day (Balanced band, see CLAUDE.md).
const NORMALIZE_DAILY_CAP = 60;

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;
  const subBlock = await requireActiveSubscription(ctx);
  if (subBlock) return subBlock;

  const body = (await request.json().catch(() => null)) as
    | { sourcePath?: unknown; sourceUrl?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // Own folder only, no traversal. Paths look like `${userId}/${ts}-${name}`.
  const sourcePath = ownedPhotoPath(userId, body);
  if (!sourcePath) {
    return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
  }

  const isAdmin = isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed);
  const countKey = `normalize_count:${userId}:${localDayKey(request)}`;
  const capCount = await consumeDailyCap(countKey);
  if (!isAdmin && capCount > NORMALIZE_DAILY_CAP) {
    return NextResponse.json(
      { error: "daily_limit_reached", limit: NORMALIZE_DAILY_CAP, used: Math.min(capCount, NORMALIZE_DAILY_CAP) },
      { status: 429 }
    );
  }
  const refund = () => {
    if (capCount !== -1) refundDailyCap(countKey);
  };

  const photo = await downloadOwnedPhoto(supabase, sourcePath);
  if ("error" in photo) {
    refund();
    return NextResponse.json({ error: photo.error }, { status: photo.status });
  }
  const inputBuffer = photo.buffer;

  let output: Buffer | null = null;
  let bgRemoved = false;
  try {
    const cut = await cutoutToCatalogJpeg(inputBuffer);
    if (cut) {
      output = cut.jpeg;
      bgRemoved = true;
      console.log(`[normalize] cutout ok ${JSON.stringify(cut.timings)} ${output.byteLength} B`);
    } else {
      console.warn("[normalize] cutout found no clear subject, keeping the plain photo");
    }
  } catch (err) {
    console.error("[normalize] cutout failed, falling back to plain resize", err);
    Sentry.captureException(err, { tags: { stage: "cutout" } });
  }

  if (!output) {
    try {
      output = await sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      refund();
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error("[normalize] sharp decode failed", detail);
      return NextResponse.json({ error: "Couldn't decode this image", detail: detail.slice(0, 300) }, { status: 422 });
    }
  }

  // Overwrite the original in place: same path, same public URL.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(sourcePath, output, { contentType: "image/jpeg", upsert: true });
  if (uploadErr) {
    refund();
    return NextResponse.json({ error: "Re-upload failed", detail: uploadErr.message }, { status: 500 });
  }

  // Cache-bust: the browser still has the raw upload cached at this URL.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(sourcePath);
  return NextResponse.json({
    url: `${data.publicUrl}?v=${Date.now()}`,
    bytes: output.byteLength,
    bgRemoved,
  });
}
