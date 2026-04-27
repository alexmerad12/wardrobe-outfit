// Client-side upload helper. Hybrid path:
//   1. Try direct POST to Supabase Storage via the supabase-js SDK.
//      Same code single-add (/wardrobe/add) has used the whole time —
//      proven to work on the user's Samsung for single uploads. POST
//      doesn't have the historical PUT-via-signed-URL CORS preflight
//      bug. No size limit (Supabase free tier allows up to 50 MB).
//   2. If direct fails for any reason (TypeError / network / 4xx /
//      5xx), fall back to /api/upload Vercel proxy — same-origin POST
//      that re-uploads to Supabase server-side. 4.5 MB body limit but
//      bypasses any cross-origin oddities.
//
// The hybrid handles every device class we've actually observed:
//   - iPhone Safari, Chrome, Edge: direct works, proxy never fires.
//   - Samsung Internet on batch 2+ (historical CORS preflight bug):
//     direct throws TypeError, proxy succeeds.
//   - Anything that wedges Supabase's REST endpoint mid-flight: proxy
//     succeeds.

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

// Direct upload to Supabase Storage via the SDK. Mirrors the exact
// call /wardrobe/add (single-add) makes — proven to work on the
// user's Samsung. POST (not PUT). Wraps the SDK call in a 120 s
// timeout race so a stalled cellular connection eventually fails
// with a real error instead of hanging forever and silently
// surfacing as a generic TypeError later.
const DIRECT_UPLOAD_TIMEOUT_MS = 120_000;

async function uploadDirect(file: File): Promise<string> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Upload 401: not signed in");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "item.jpg";
  const path = `${session.user.id}/${Date.now()}-${safeName}`;
  const BUCKET = "clothing-images";

  const uploadPromise = supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  const result = await Promise.race([
    uploadPromise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("Upload 408: direct upload timed out (cellular?)")),
        DIRECT_UPLOAD_TIMEOUT_MS
      )
    ),
  ]);

  const { error } = result;
  if (error) {
    const status = (error as { statusCode?: string }).statusCode ?? "500";
    throw new Error(`Upload ${status}: ${error.message}`);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Vercel functions cap request bodies at 4.5 MB at the edge layer —
// anything bigger surfaces as "Upload network error (no bytes sent)".
// Phone photos are routinely 5-10 MB. So the proxy fallback genuinely
// can't accept those, and falling through to it just produces the
// confusing error. Skip the proxy when the file is too big for it.
const PROXY_BODY_LIMIT = 4_000_000;

async function attemptUpload(file: File): Promise<string> {
  const controller = new AbortController();
  activeControllers.add(controller);
  try {
    // Step 1: try direct upload to Supabase. Works on every device
    // class we've observed (single-add proves it on the user's
    // Samsung). Now wrapped in a 120 s timeout so we don't hang
    // forever on a stalled cellular connection.
    try {
      return await uploadDirect(file);
    } catch (directErr) {
      // Step 2: file is small enough to fit Vercel's body cap → fall
      // back to /api/upload proxy. Same-origin POST, immune to CORS
      // edge cases.
      if (file.size <= PROXY_BODY_LIMIT) {
        console.warn("[upload] direct failed, falling back to proxy:", directErr);
        return await postViaXhr(file, controller.signal);
      }
      // File is too big for the proxy too — re-throw the direct error
      // (rather than the proxy's misleading "no bytes sent") so retries
      // know to back off and the tile error UI is informative.
      console.warn(
        `[upload] direct failed and file is ${file.size} bytes (> ${PROXY_BODY_LIMIT} proxy limit) — not falling back`,
        directErr
      );
      throw directErr;
    }
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
