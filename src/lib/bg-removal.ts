// Main-thread API for background removal. All actual work happens in a
// dedicated Web Worker (bg-removal.worker.ts), so the UI stays responsive
// even while the ~80 MB model downloads and inference runs.

type ProgressCb = (key: string, current: number, total: number) => void;

type PreloadMessage = { id: number; type: "preload" };
type RemoveMessage = { id: number; type: "remove"; image: Blob };
type WorkerInbound = PreloadMessage | RemoveMessage;

type WorkerOutbound =
  | { id: number; type: "progress"; key: string; current: number; total: number }
  | { id: number; type: "preloaded" }
  | { id: number; type: "result"; blob: Blob }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: Blob | void) => void; reject: (err: Error) => void; onProgress?: ProgressCb }
>();

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
    } else if (data.type === "preloaded") {
      pending.delete(data.id);
      entry.resolve();
    } else if (data.type === "result") {
      pending.delete(data.id);
      entry.resolve(data.blob);
    } else if (data.type === "error") {
      pending.delete(data.id);
      entry.reject(new Error(data.message));
    }
  });
  worker.addEventListener("error", (event) => {
    console.error("bg-removal worker error:", event.message);
  });
  return worker;
}

function sendToWorker(
  message: Omit<PreloadMessage, "id"> | Omit<RemoveMessage, "id">,
  onProgress?: ProgressCb
): Promise<Blob | void> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ ...message, id } as WorkerInbound);
  });
}

let preloaded: Promise<void> | null = null;

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

export async function removeBg(image: Blob | File, onProgress?: ProgressCb): Promise<Blob> {
  // Fire-and-forget preload; the worker queues the remove behind it either
  // way. No main-thread blocking.
  preloadBgRemoval(onProgress).catch(() => {});
  const result = (await sendToWorker({ type: "remove", image }, onProgress)) as Blob;
  return result;
}
