// Client-side upload helper. POSTs the image (wrapped in a multipart
// FormData) to our own /api/upload route, which proxies it to Supabase
// Storage server-side.
//
// We moved off tus resumable uploads: the protocol's retry dance works
// for big files (videos, etc.) but on small ~500 KB JPEGs over mobile
// cellular it was hanging individual uploads for ~3 minutes of
// backoffs before surfacing any failure, and occasionally sitting
// silently in a processing state the user saw as "stuck." A plain
// POST with an AbortController + explicit client retry is both faster
// in the happy path and fails louder when something actually breaks.

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
    const statusMatch = err.message.match(/Upload (\d{3})/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      if (PERMANENT_STATUSES.has(status)) {
        return { retryable: false, label: `HTTP ${status} (permanent)` };
      }
      return { retryable: true, label: `HTTP ${status} (transient)` };
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
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Upload ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`
      );
    }
    const { url } = (await res.json()) as { url: string };
    return url;
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
