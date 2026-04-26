// Client-side upload helper. Direct browser → Supabase Storage upload
// via the supabase-js SDK. Same path that /wardrobe/add (single-add)
// has always used.
//
// History (keep this so nobody regresses to an earlier design):
//   - tus resumable uploads: 3-min backoffs on mobile, abandoned.
//   - Direct PUT via fetch/XHR to a signed URL: intermittent CORS
//     preflight failures on Samsung Internet Browser circa 2025-Q3.
//   - /api/upload Vercel proxy: bypassed CORS but inherited Vercel's
//     4.5 MB function-body limit; bulk uploads hit "no bytes sent"
//     when bg-removal output + size guard didn't shrink enough.
//   - This version: direct supabase.storage.upload(). Single-add has
//     used this path the whole time without issues, so it should
//     work for bulk too. If Samsung CORS comes back we'll see it in
//     production logs and add a proxy fallback then.
//
// Bytes flow: browser → Supabase Storage REST endpoint, no Vercel
// function in path. No 4.5 MB limit; Supabase free tier allows up to
// 50 MB per file.

import { createClient } from "@/lib/supabase/client";

const ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

// Permanent HTTP statuses that will never succeed on retry.
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 413, 415]);

const BUCKET = "clothing-images";

// Registry of in-flight uploads so cancelAllActiveUploads() can
// abort the batch when the user taps Cancel on the uploading page.
const activeControllers = new Set<AbortController>();

export function cancelAllActiveUploads(): void {
  for (const c of activeControllers) {
    try {
      c.abort();
    } catch {}
  }
  activeControllers.clear();
}

function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    const statusMatch = err.message.match(/Upload (\d{3})/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      return !PERMANENT_STATUSES.has(status);
    }
  }
  return true;
}

async function uploadDirect(file: File, abortSignal: AbortSignal): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  if (sessionErr) throw new Error(`Upload: ${sessionErr.message}`);
  if (!session?.user?.id) throw new Error("Upload 401: not signed in");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "item.jpg";
  const path = `${session.user.id}/${Date.now()}-${safeName}`;

  // Race the upload against an abort + a timeout. The Supabase SDK
  // doesn't expose AbortSignal across all versions, so we wrap.
  const uploadPromise = supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
    .then((res) => {
      if (res.error) {
        // Map SDK errors into the same "Upload {status}: ..." shape
        // the rest of the codebase expects (so isRetryable still works).
        const status =
          (res.error as { statusCode?: string }).statusCode ?? "500";
        throw new Error(`Upload ${status}: ${res.error.message}`);
      }
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    });

  return await Promise.race([
    uploadPromise,
    new Promise<string>((_resolve, reject) => {
      const onAbort = () => reject(new DOMException("Upload aborted", "AbortError"));
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener("abort", onAbort, { once: true });
      setTimeout(() => reject(new DOMException("Upload timed out", "AbortError")), ATTEMPT_TIMEOUT_MS);
    }),
  ]);
}

async function attemptUpload(file: File): Promise<string> {
  const controller = new AbortController();
  activeControllers.add(controller);
  try {
    return await uploadDirect(file, controller.signal);
  } finally {
    activeControllers.delete(controller);
  }
}

export async function uploadToSupabase(file: File): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptUpload(file);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        console.error(
          `[upload] attempt ${attempt}/${MAX_ATTEMPTS} failed, not retrying further`,
          err
        );
        throw err;
      }
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 10_000;
      console.warn(
        `[upload] attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying in ${delay}ms`,
        err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable — loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error("Upload failed");
}
