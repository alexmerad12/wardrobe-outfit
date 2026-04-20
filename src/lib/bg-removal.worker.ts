/// <reference lib="webworker" />

import { preload, removeBackground, type Config } from "@imgly/background-removal";

// Runs in a dedicated Web Worker. Everything here — the 80+ MB model
// download, WASM instantiation, and ONNX inference — stays off the main
// thread so the page never freezes.

type InboundMessage =
  | { id: number; type: "preload" }
  | { id: number; type: "remove"; image: Blob };

type OutboundMessage =
  | { id: number; type: "progress"; key: string; current: number; total: number }
  | { id: number; type: "preloaded" }
  | { id: number; type: "result"; blob: Blob }
  | { id: number; type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function buildConfig(id: number): Config {
  return {
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      const msg: OutboundMessage = { id, type: "progress", key, current, total };
      ctx.postMessage(msg);
    },
  };
}

let preloadPromise: Promise<void> | null = null;
function ensurePreloaded(id: number): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = preload(buildConfig(id)).catch((err) => {
      preloadPromise = null;
      throw err;
    });
  }
  return preloadPromise;
}

ctx.addEventListener("message", async (event: MessageEvent<InboundMessage>) => {
  const data = event.data;
  try {
    if (data.type === "preload") {
      await ensurePreloaded(data.id);
      const done: OutboundMessage = { id: data.id, type: "preloaded" };
      ctx.postMessage(done);
    } else if (data.type === "remove") {
      await ensurePreloaded(data.id);
      const blob = await removeBackground(data.image, buildConfig(data.id));
      const done: OutboundMessage = { id: data.id, type: "result", blob };
      ctx.postMessage(done);
    }
  } catch (err) {
    const done: OutboundMessage = {
      id: data.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(done);
  }
});
