
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
// Budget: 5 attempts, 90 s per attempt, backoff 2s/5s/10s/20s. Worst
// case a genuinely wedged upload burns ~8.5 min before turning the
// tile red. That's long, but the alternative — giving up after 3
// retries when the 4th might succeed — was how users were getting
// "3 of 5 failed" on marginal mobile signal. Empirically most real
// uploads succeed on attempt 1; retries 2+ exist purely for the
// carrier-handoff / signal-dropout cases the first attempt hit.
const ATTEMPT_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];

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

// XHR-based PUT to the signed URL. We were using the Supabase SDK's
// uploadToSignedUrl (which uses fetch internally), but the user's
// Samsung S21 FE was hitting systematic "TypeError: Failed to fetch"
// on every PUT in batch 2+ — 5/5 items, not flaky signal. The leading
// theory is Samsung Internet's aggressive CORS-preflight caching: the
// first batch's OPTIONS preflight succeeds, then a stale/misbehaved
// cache entry makes every subsequent fetch fail before the request
// leaves the device. XHR has a different internal code path in the
// browser — it doesn't consult the same fetch-layer preflight cache
// and sends an inline OPTIONS when needed, so it sidesteps the bug.
//
// The body format matches exactly what supabase-js constructs for
// uploadToSignedUrl: a FormData with `cacheControl` and the blob
// appended under an empty key, plus `x-upsert` as a request header.
// That's how Supabase Storage expects the request; any deviation
// produces silent 4xx/CORS rejection.
function putViaXhr(
  signedUrl: string,
  file: File,
  abortSignal: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      try {
        xhr.abort();
      } catch {}
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    const body = new FormData();
    body.append("cacheControl", "3600");
    // Supabase SDK appends the file under an empty field name.
    body.append("", file);

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert", "false");
    // Do NOT set Content-Type — the browser will set the correct
    // multipart/form-data boundary automatically for FormData bodies.
    // Explicit per-XHR timeout. Belt-and-braces in addition to the
    // outer AbortController: some mobile browsers ignore or lag
    // abort() mid-flight but respect xhr.timeout directly.
    xhr.timeout = ATTEMPT_TIMEOUT_MS;
    // Track how much of the file actually made it onto the wire so
    // we can tell a "never got a packet out" network error from a
    // "connection died 90% through the upload" one.
    let lastLoaded = 0;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) lastLoaded = e.loaded;
    };

    xhr.onload = () => {
      abortSignal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Upload ${xhr.status}${xhr.responseText ? `: ${xhr.responseText.slice(0, 160)}` : ""}`
          )
        );
      }
    };
    xhr.onerror = () => {
      abortSignal.removeEventListener("abort", onAbort);
      // XHR's onerror fires on network failures with no response —
      // DNS failure, connection drop, TLS failure, CORS rejection.
      // Include how far the upload progressed so "died at byte 0"
      // (DNS/CORS) is distinguishable from "died at byte N of M"
      // (network dropped mid-stream) in the user-facing error.
      const progress =
        lastLoaded > 0
          ? ` (sent ${Math.round((lastLoaded / file.size) * 100)}%)`
          : " (no bytes sent)";
      reject(new TypeError(`XHR network error${progress}`));
    };
    xhr.onabort = () => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(
        new DOMException("Upload aborted", "AbortError")
      );
    };
    xhr.ontimeout = () => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(new DOMException("Upload timed out", "AbortError"));
    };

    xhr.send(body);
  });
}

async function attemptUpload(file: File): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  activeControllers.add(controller);
  try {
    // Phase 1: get a signed upload URL. Tiny JSON request, ~100-300
    // ms — Vercel's function timeout is not a concern here. Keep
    // this on fetch since it goes to our own origin.
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
    const { signedUrl, publicUrl } = (await signRes.json()) as {
      signedUrl: string;
      publicUrl: string;
    };

    // Phase 2: PUT the file to Supabase via XHR (not fetch). See the
    // putViaXhr doc comment above for why — in short, Samsung
    // Internet's fetch-layer CORS cache was systematically rejecting
    // batch-2+ uploads with "TypeError: Failed to fetch" on the
    // user's device. XHR uses a separate code path.
    await putViaXhr(signedUrl, file, controller.signal);
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
