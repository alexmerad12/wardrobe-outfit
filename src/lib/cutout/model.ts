// Self-hosted background-removal model: BiRefNet-lite (MIT license), the
// fp16-weight ONNX export from onnx-community. Chosen 2026-10-15 after a
// 12-photo benchmark against Photoroom on Linette's own wardrobe shots:
// 98.0 % mean mask overlap with Photoroom (worst photo 95.1 %, a belt),
// beating BEN2 (97.9 %) while running ~40 % faster. The fp16 file gives the
// exact same masks as the fp32 one at half the download (115 MB).
//
// The weights are NOT in the repo or the function bundle. Each server
// instance downloads them once from the URL below (pinned to an immutable
// Hugging Face commit, verified by SHA-256), caches them in /tmp for the
// rest of the instance's life, and keeps one inference session in memory.

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ort from "onnxruntime-node";

export const MODEL_INPUT_SIZE = 1024;

const MODEL_SHA256 = "d39b897ceb16ae654c1731f3dba0cf9b368d9cae74b5a57459b455cc8bfec402";
const DEFAULT_MODEL_URL =
  "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model_fp16.onnx";
const CACHE_PATH = path.join(os.tmpdir(), `birefnet-lite-fp16-${MODEL_SHA256.slice(0, 12)}.onnx`);

let sessionPromise: Promise<ort.InferenceSession> | null = null;
// One inference at a time per instance: two concurrent 1024px runs double
// peak memory and each finishes no sooner than if they queued.
let inferenceQueue: Promise<unknown> = Promise.resolve();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadModelBytes(): Promise<Uint8Array> {
  try {
    const cached = await readFile(CACHE_PATH);
    if (sha256(cached) === MODEL_SHA256) return cached;
  } catch {
    // Not cached on this instance yet.
  }
  const url = process.env.CUTOUT_MODEL_URL || DEFAULT_MODEL_URL;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`cutout model download failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (sha256(bytes) !== MODEL_SHA256) throw new Error("cutout model checksum mismatch");
  const tmp = `${CACHE_PATH}.${process.pid}.${Date.now()}.part`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, CACHE_PATH);
  } catch {
    // A read-only or full /tmp only costs a re-download next cold start.
  }
  return bytes;
}

export function getCutoutSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = loadModelBytes()
      .then((bytes) =>
        ort.InferenceSession.create(bytes, {
          // Capped: more threads than physical cores made a 10 s run take
          // 40-60 s in local tests (oversubscription). Vercel functions
          // have 1-2 vCPUs; CUTOUT_THREADS overrides for other hosts.
          intraOpNumThreads:
            Number(process.env.CUTOUT_THREADS) || Math.min(2, Math.max(1, os.availableParallelism())),
          interOpNumThreads: 1,
          executionMode: "sequential",
          graphOptimizationLevel: "all",
          logSeverityLevel: 3,
        })
      )
      .catch((err) => {
        sessionPromise = null; // let the next request retry
        throw err;
      });
  }
  return sessionPromise;
}

/**
 * Run the model on a 1024x1024 RGB image (interleaved 8-bit) and return the
 * raw logits, one per pixel. Serialized per instance.
 */
export async function predictLogits(rgb1024: Uint8Array): Promise<Float32Array> {
  const session = await getCutoutSession();
  const plane = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * plane + i] = (rgb1024[i * 3 + c] / 255 - mean[c]) / std[c];
    }
  }
  const run = async () => {
    const feeds = {
      [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]),
    };
    const out = await session.run(feeds);
    const tensor = out[session.outputNames[0]];
    const data = tensor.data;
    if (data instanceof Float32Array) return data;
    return Float32Array.from(data as ArrayLike<number>);
  };
  const result = inferenceQueue.then(run, run);
  inferenceQueue = result.catch(() => undefined);
  return result;
}
