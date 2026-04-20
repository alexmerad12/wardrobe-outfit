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

const ATTEMPT_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 2_000, 5_000]; // before each attempt

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

export async function uploadToSupabase(file: File): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
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
    } catch (err) {
      lastErr = err;
      // If the user cancelled via cancelAllActiveUploads, stop retrying.
      if (controller.signal.aborted && !activeControllers.has(controller)) {
        throw new Error("Upload cancelled");
      }
      console.warn(
        `[upload] attempt ${attempt}/${MAX_ATTEMPTS} failed`,
        err
      );
    } finally {
      clearTimeout(timer);
      activeControllers.delete(controller);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Upload failed");
}
