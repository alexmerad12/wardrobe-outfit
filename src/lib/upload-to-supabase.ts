import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

// Shared client-side upload helper for everything that needs to push an
// image to Supabase Storage — bulk pending queue, single-item edit, etc.
//
// Uses the tus.io resumable upload protocol so dropped TCP connections
// (routine on mobile cellular) pause and resume instead of wiping the
// whole upload. Endpoint is the standard Supabase REST hostname — the
// docs-recommended path — rather than the direct `*.storage.supabase.co`
// subdomain, which some ISPs / Samsung Internet were failing to resolve.

const BUCKET = "clothing-images";
const TUS_CHUNK_SIZE = 6 * 1024 * 1024; // Supabase-mandated 6 MB.

function projectIdFromSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  return new URL(url).hostname.split(".")[0];
}

export async function uploadToSupabase(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id || !session.access_token) {
    throw new Error("Not signed in");
  }

  const projectId = projectIdFromSupabaseUrl();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectName = `${session.user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;

  return new Promise<string>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      // Extra-long retry ladder for mobile cellular — up to ~2 minutes
      // of pause-and-resume before giving up.
      retryDelays: [0, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 90_000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: BUCKET,
        objectName,
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      },
      // Retry on every error — the library's default is conservative and
      // skips some recoverable network failures.
      onShouldRetry() {
        return true;
      },
      onError(err) {
        console.error("[tus] upload failed for", objectName, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      onSuccess() {
        const publicUrl = supabase.storage
          .from(BUCKET)
          .getPublicUrl(objectName).data.publicUrl;
        resolve(publicUrl);
      },
    });

    // Resume a half-finished upload of the same file if one exists.
    upload
      .findPreviousUploads()
      .then((prev) => {
        if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
        upload.start();
      })
      .catch(() => {
        // Lookup failed — just start fresh.
        upload.start();
      });
  });
}
