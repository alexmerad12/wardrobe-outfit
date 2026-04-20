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

// One shot, no auto-retry. If a request fails, the user sees a red
// tile immediately and taps it to retry — that's better UX than silent
// 5-second retry loops that feel like the app is frozen. Mobile
// uploads of a ~500 KB JPEG through a server proxy should succeed on
// first attempt in every normal case; anything that fails on attempt 1
// probably won't succeed on attempt 2 either.
const ATTEMPT_TIMEOUT_MS = 30_000;

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
