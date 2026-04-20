// Main-thread API for background removal.
//
// All heavy lifting runs in a dedicated Web Worker (bg-removal.worker.ts) so
// the UI never freezes. Layered defences against every failure mode we've
// seen in the wild:
//   - Input downscaling: phone photos are 12MP; the model only uses ~1K
//     pixels, so shrinking first makes processing 5-10x faster and avoids
//     out-of-memory crashes on older devices.
//   - Timeout: a wedged worker can't hang forever — after 90 s we kill it
//     and reject so the UI recovers.
//   - Auto-respawn: if the worker throws or we kill it, the next call
//     starts a fresh one. No "you have to refresh" dead states.

type ProgressCb = (key: string, current: number, total: number) => void;

type PreloadMessage = { id: number; type: "preload" };
type RemoveMessage = { id: number; type: "remove"; image: Blob };
type WorkerInbound = PreloadMessage | RemoveMessage;

type WorkerOutbound =
  | { id: number; type: "progress"; key: string; current: number; total: number }
  | { id: number; type: "preloaded" }
  | { id: number; type: "result"; blob: Blob }
  | { id: number; type: "error"; message: string };

type PendingEntry = {
  resolve: (value: Blob | void) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCb;
  timer: ReturnType<typeof setTimeout>;
};

// 3 minutes per message — generous enough that a chunky photo on a slow
// device can finish even when others are queued behind it. The pending
// context serialises calls at its layer anyway, so this timeout only
// fires on a genuinely stuck worker.
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_INPUT_DIMENSION = 1600;

let worker: Worker | null = null;
let preloaded: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, PendingEntry>();

function destroyWorker(reason: string) {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  preloaded = null;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./bg-removal.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const data = event.data;
    const entry = pending.get(data.id);
    if (!entry) return;
    if (data.type === "progress") {
      entry.onProgress?.(data.key, data.current, data.total);
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(data.id);
    if (data.type === "preloaded") {
      entry.resolve();
    } else if (data.type === "result") {
      entry.resolve(data.blob);
    } else if (data.type === "error") {
      entry.reject(new Error(data.message));
    }
  });
  worker.addEventListener("error", (event) => {
    console.error("bg-removal worker crashed:", event.message);
    destroyWorker("Background removal worker crashed");
  });
  worker.addEventListener("messageerror", () => {
    destroyWorker("Background removal worker message error");
  });
  return worker;
}

function sendToWorker(
  message: Omit<PreloadMessage, "id"> | Omit<RemoveMessage, "id">,
  onProgress?: ProgressCb,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Blob | void> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<Blob | void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = pending.get(id);
      if (!entry) return;
      // Only drop THIS message — don't destroy the worker. Other queued
      // items might still be finishing. Worker-level problems trigger the
      // error/messageerror listeners, which do tear it down.
      pending.delete(id);
      reject(new Error("Background removal timed out"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, onProgress, timer });
    w.postMessage({ ...message, id } as WorkerInbound);
  });
}

// Shrink the image to a sane working size before sending it to the worker.
// The ML model operates on a ~1024 px square internally anyway — uploading
// a 12 MP phone photo just wastes bandwidth, memory, and processing time.
async function downscale(source: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= MAX_INPUT_DIMENSION) {
      bitmap.close();
      return source;
    }
    const scale = MAX_INPUT_DIMENSION / maxSide;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    if ("convertToBlob" in canvas) {
      return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
        "image/png"
      );
    });
  } catch {
    // If we can't decode (corrupt/unsupported format), let the worker try —
    // imgly has its own decoder and may still succeed.
    return source;
  }
}

export function preloadBgRemoval(onProgress?: ProgressCb): Promise<void> {
  if (preloaded) return preloaded;
  preloaded = (sendToWorker({ type: "preload" }, onProgress) as Promise<void>).catch(
    (err) => {
      preloaded = null;
      throw err;
    }
  );
  return preloaded;
}

export async function removeBg(
  image: Blob | File,
  onProgress?: ProgressCb
): Promise<Blob> {
  const working = await downscale(image);
  // Fire-and-forget — the worker processes preload + remove in order anyway.
  preloadBgRemoval(onProgress).catch(() => {});
  const result = (await sendToWorker({ type: "remove", image: working }, onProgress)) as Blob;
  return result;
}
