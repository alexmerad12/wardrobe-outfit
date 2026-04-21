// Client-side upload helper. One code path: POST the file to our own
// origin at /api/upload, which re-uploads to Supabase server-side.
// No CORS, no signed URLs, no fetch-vs-XHR fallback dance.
//
// History (keep this so nobody regresses to an earlier design):
//   - tus resumable uploads: 3-min backoffs on mobile, abandoned.
//   - Direct PUT to Supabase via signed URL (fetch): intermittent
//     failures on Samsung Internet Browser; its CORS preflight cache
//     misbehaves for cross-origin PUT.
//   - Direct PUT via XHR: same failure, different code path in the
//     browser didn't route around the same preflight cache.
//   - Direct + proxy fallback: 'no bytes sent' on direct triggered
//     fallback, but by then we were shipping 2-3 MB transparent PNGs
//     through a buffering proxy and hitting Vercel timeouts.
//   - This version: the image is flattened to a ~200-400 KB white-bg
//     JPEG before upload (see flattenOntoWhite in image-utils), and
//     we ALWAYS use the proxy. Same-origin POST is immune to CORS
//     preflight quirks, Samsung or otherwise. At that file size the
//     Vercel function finishes in 1-2 s, well under the Hobby 10 s
//     ceiling. One code path, no classification of which error
//     means what — robust across the devices a real user base will
//     bring to the app.

// Conservative ceiling per attempt. A 200-400 KB POST + Supabase
// re-upload usually completes in under 3 s; 60 s tolerates a
// Vercel cold start + a weak mobile signal.
const ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 5;
// Exponential backoff. Catches transient carrier hiccups without
// feeling like the app froze.
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

// Permanent HTTP statuses that will never succeed on retry.
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 413, 415]);

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
  // Unknown error shape — retry. The user explicitly asked for
  // resilience over fast-fail.
  return true;
}

// XHR-based POST instead of fetch. Not for CORS reasons (this is
// same-origin) but because XHR exposes upload progress events,
// handles timeouts via xhr.timeout in a way that's consistent with
// abort(), and has better mobile-browser track record for multipart
// POSTs than fetch.
function postViaXhr(file: File, abortSignal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      try {
        xhr.abort();
      } catch {}
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    const body = new FormData();
    body.append("file", file);

    xhr.open("POST", "/api/upload", true);
    xhr.timeout = ATTEMPT_TIMEOUT_MS;

    // Track bytes actually written so error reports can distinguish
    // "never got a packet out" from "died mid-upload."
    let lastLoaded = 0;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) lastLoaded = e.loaded;
    };

    xhr.onload = () => {
      abortSignal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { url } = JSON.parse(xhr.responseText) as { url: string };
          if (!url) {
            reject(new Error("Upload: server returned no URL"));
            return;
          }
          resolve(url);
        } catch {
          reject(new Error("Upload: malformed server response"));
        }
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
      const progress =
        lastLoaded > 0
          ? ` (sent ${Math.round((lastLoaded / file.size) * 100)}%)`
          : " (no bytes sent)";
      reject(new TypeError(`Upload network error${progress}`));
    };
    xhr.onabort = () => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(new DOMException("Upload aborted", "AbortError"));
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
  activeControllers.add(controller);
  try {
    return await postViaXhr(file, controller.signal);
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
