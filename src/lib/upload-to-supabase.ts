import { createClient } from "@/lib/supabase/client";

const BUCKET = "clothing-images";

// Client-side upload helper. Two-phase:
//   1. POST a tiny JSON request to /api/upload/sign — server returns a
//      short-lived Supabase signed URL + path + token.
//   2. PUT the file bytes DIRECTLY to Supabase Storage using that URL.
//      The file never passes through our Vercel function, so we don't
//      inherit the platform's 10 s (Hobby) / 60 s (Pro) function
//      timeout or the memory-buffering pressure that was killing
//      concurrent 4 MB uploads on mobile cellular.
//
// History of this module, so nobody regresses it:
//   - tus resumable uploads: hung 3 min on mobile backoffs, items
//     looked "stuck," abandoned.
//   - Server-proxied multipart POST to /api/upload: worked in dev,
//     failed intermittently in prod under any network turbulence —
//     Vercel serverless would time out buffering a 4 MB body while
//     simultaneously talking to Supabase upstream. That's the mode
//     the user saw as "2 of 5 errors, tap retry."
//   - Current: direct signed-URL upload. Same pattern every serious
//     image-upload SaaS uses (Cloudinary, Uploadcare, Supabase's own
//     docs). The only thing our server does is mint a signed URL.

// Upload robustness knobs. The goal is "never errors under any
// realistic mobile network condition" — the user said any failure is
// unacceptable. So we retry aggressively on anything that looks
// transient (network drops, server 5xx, timeouts) while still failing
// fast on permanent errors (auth, payload too big, bad request).
//
// Budget: 3 total attempts with exponential backoff, 60 s per attempt.
// Worst case a truly wedged upload takes 3×60 + 1 + 3 ≈ 3.1 min before
// the user sees a red tile — that's long but acceptable since the cap
// is only hit for genuine connectivity problems the user can see in
// their phone's signal bar.
const ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
// Exponential backoff between attempts: 1 s, then 3 s.
const RETRY_DELAYS_MS = [1_000, 3_000];

// Registry of in-flight uploads so cancelAllActiveUploads() can abort
// the batch when the user taps Cancel on the /wardrobe/uploading page.
const activeControllers = new Set<AbortController>();

export function cancelAllActiveUploads(): void {
  for (const c of activeControllers) {
    try {
      c.abort();
    } catch {}
  }
  activeControllers.clear();
}

// Permanent HTTP statuses that will never succeed on retry. A 401
// means the session is bad, 413 means the file is too big, 400 means
// the server rejected the payload. Retrying these just wastes time.
// Everything else (5xx server errors, 408, 429) and anything at the
// network layer (TypeError, AbortError) is considered transient.
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 413, 415]);

function classifyError(err: unknown): {
  retryable: boolean;
  label: string;
} {
  if (err instanceof TypeError) {
    return { retryable: true, label: "network (fetch threw)" };
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return { retryable: true, label: "timeout (AbortError)" };
  }
  if (err instanceof Error) {
    // Match either "Upload NNN" (PUT to Supabase) or "Sign NNN" (our
    // signed-URL endpoint). Same permanent-vs-transient rules apply.
    const statusMatch = err.message.match(/(?:Upload|Sign) (\d{3})/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      const phase = err.message.startsWith("Sign") ? "sign" : "PUT";
      if (PERMANENT_STATUSES.has(status)) {
        return { retryable: false, label: `${phase} HTTP ${status} (permanent)` };
      }
      return { retryable: true, label: `${phase} HTTP ${status} (transient)` };
    }
  }
  // Unknown error shape — err on the side of retrying, since the user
  // explicitly asked for resilience over fast-fail.
  return { retryable: true, label: "unknown" };
}

async function attemptUpload(file: File): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  activeControllers.add(controller);
  try {
    // Phase 1: get a signed upload URL. This is a tiny JSON request
    // to our server (~100-300 ms) so the Vercel timeout isn't a
    // concern. We send filename + contentType so the server can
    // construct a sensible storage path.
    const signRes = await fetch("/api/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "image/jpeg",
      }),
      signal: controller.signal,
    });
    if (!signRes.ok) {
      const text = await signRes.text().catch(() => "");
      throw new Error(
        `Sign ${signRes.status}${text ? `: ${text.slice(0, 160)}` : ""}`
      );
    }
    const { path, token, publicUrl } = (await signRes.json()) as {
      signedUrl: string;
      path: string;
      token: string;
      publicUrl: string;
    };

    // Phase 2: use the Supabase SDK's uploadToSignedUrl. The SDK
    // wraps the File in FormData with a cacheControl field and
    // sends the correct x-upsert header + content-type metadata
    // that Supabase's storage API requires. We tried a naive
    // `fetch(signedUrl, { method: "PUT", body: file })` first, but
    // that's only a partial match for what the server expects and
    // was producing intermittent "Failed to fetch" CORS/format
    // failures on the second batch of uploads — exactly the mode
    // the user reported. Delegating to the SDK keeps us in sync
    // with however Supabase evolves the protocol.
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(path, token, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (error) {
      throw new Error(`Upload: ${error.message}`);
    }
    return publicUrl;
  } finally {
    clearTimeout(timer);
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
      const { retryable, label } = classifyError(err);
      if (!retryable || attempt === MAX_ATTEMPTS) {
        if (!retryable) {
          console.error(`[upload] ${label} — not retrying`, err);
        } else {
          console.error(
            `[upload] ${label} — exhausted ${MAX_ATTEMPTS} attempts`,
            err
          );
        }
        throw err;
      }
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 3_000;
      console.warn(
        `[upload] attempt ${attempt} failed (${label}), retrying in ${delay}ms`,
        err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error("Upload failed");
}
