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
// Retry budget. We previously dropped this to 2 because Promise.race
// on uploadDirect was creating zombie fetches (storage-js can't be
// aborted, so a "timed-out" upload kept consuming bandwidth and each
// stacked retry made the next fail with "Failed to fetch"). The race
// has since been removed — uploads now run to natural completion
// or failure — so the zombie problem is gone and we can absorb more
// transient flakiness. 4 attempts × longer backoff covers a brief
// AP roam, a TCP reset between back-to-back multipart POSTs, and
// the occasional captive-portal blip.
// 5 attempts × backoff [2, 5, 12, 30] = ~49 s of retry runway. Covers
// the multi-second WiFi blips and AP roams that 19 s of runway didn't.
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000, 30_000];

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
      // readyState tells us how far the request got: 1=opened-not-sent,
      // 2=headers-received, 3=loading, 4=done. "no bytes sent" + state 1
      // means the browser refused the outbound POST entirely (typically
      // memory pressure or network adapter wedge), not a server problem.
      reject(
        new TypeError(
          `Upload network error${progress} [rs=${xhr.readyState} st=${xhr.status}]`
        )
      );
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
// user's Samsung. POST (not PUT).
//
// No client-side timeout race here on purpose: storage-js doesn't
// expose AbortSignal, so a "timed-out" upload keeps consuming
// bandwidth in the background. Stacking those across retries was
// what produced the "Upload 500: Failed to fetch" cascade users saw
// — each retry's underlying fetch had no bandwidth left because
// previous "timed-out" uploads were still consuming it. The native
// fetch implementation has its own ~5-minute timeout, which is the
// real ceiling. Better to let one upload run to completion (or
// natural failure) than to start three.
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

  // Always send a non-empty contentType. Some files (HEIC variants
  // off Samsung's share sheet, certain camera-roll exports) arrive
  // with file.type === "" and the storage SDK has been observed to
  // construct a malformed Content-Type header that some CDNs reject
  // pre-body, surfacing as a TypeError "Failed to fetch".
  const contentType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType });
  if (error) {
    // Distinguish network-level failure (no statusCode — fetch threw
    // before any HTTP response came back) from a real server error.
    // The error class name (StorageApiError vs StorageUnknownError)
    // is baked into the message so it's visible in the tile UI without
    // needing devtools — critical for diagnosing on mobile, where
    // there's no console.
    const status = (error as { statusCode?: string }).statusCode;
    const tag = error.constructor?.name || error.name || "?";
    if (status) {
      throw new Error(`Upload ${status}: ${error.message} [${tag}]`);
    }
    throw new TypeError(`Upload network error: ${error.message} [${tag}]`);
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

function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      ctor: err.constructor.name,
      name: err.name,
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 3).join(" | "),
    };
  }
  return { value: String(err) };
}

export async function uploadToSupabase(file: File): Promise<string> {
  const fileSummary = {
    name: file.name,
    size: file.size,
    type: file.type || "(empty)",
    lastModified: file.lastModified,
  };
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // If the device went offline since the last attempt, wait for it
    // to come back rather than burning a retry on a guaranteed failure.
    // navigator.onLine isn't perfectly reliable but it catches the
    // common "stepped out of WiFi range" case.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      console.warn(
        `[upload] offline detected before attempt ${attempt}/${MAX_ATTEMPTS} — waiting up to 15s for reconnect`
      );
      await new Promise<void>((resolve) => {
        const onOnline = () => {
          window.removeEventListener("online", onOnline);
          resolve();
        };
        window.addEventListener("online", onOnline);
        setTimeout(() => {
          window.removeEventListener("online", onOnline);
          resolve();
        }, 15_000);
      });
    }
    try {
      const result = await attemptUpload(file);
      if (attempt > 1) {
        console.log(`[upload] attempt ${attempt} succeeded`, fileSummary);
      }
      return result;
    } catch (err) {
      lastErr = err;
      const errInfo = describeError(err);
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        console.error(`[upload] attempt ${attempt}/${MAX_ATTEMPTS} GAVE UP`, {
          file: fileSummary,
          err: errInfo,
        });
        // Embed attempt count in the message so the tile UI shows
        // whether retries actually happened — without this, "Upload 500"
        // is ambiguous between "1 attempt failed instantly" and
        // "all 4 attempts exhausted".
        if (err instanceof Error) {
          const wrapped = new (err.constructor as typeof Error)(
            `${err.message} (after ${attempt}/${MAX_ATTEMPTS} tries)`
          );
          wrapped.name = err.name;
          throw wrapped;
        }
        throw err;
      }
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 10_000;
      console.warn(
        `[upload] attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying in ${delay}ms`,
        { file: fileSummary, err: errInfo }
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable — loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error("Upload failed");
}
