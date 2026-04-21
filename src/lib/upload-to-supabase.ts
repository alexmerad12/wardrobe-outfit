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

// Single silent retry is reserved for transient network-level
// failures — specifically TypeError ("Failed to fetch"), which is what
// the browser throws when a request gets cancelled mid-flight by a
// flaky cell radio, a wifi handoff, or a server-side connection
// reset. Those legitimately succeed on the second try. HTTP errors
// (4xx/5xx) do NOT retry — if the server said no, asking again won't
// change the answer, and we don't want tus-style multi-minute retry
// loops that make the app feel frozen.
const ATTEMPT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 800;

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
  try {
    return await attemptUpload(file);
  } catch (err) {
    // Only retry transient network failures. TypeError is what the
    // browser throws when a request fails at the network layer before
    // a response arrives — the classic "Failed to fetch" case. Any
    // HTTP error (4xx/5xx) surfaces as a normal Error with the status
    // in the message, and those are NOT retried: a 401 means auth
    // problem, a 413 means file too big, a 500 means server bug —
    // retrying just delays the user seeing the real failure.
    const isTransient = err instanceof TypeError;
    if (!isTransient) throw err;
    console.warn("[upload] transient network failure, retrying once:", err);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return attemptUpload(file);
  }
}
