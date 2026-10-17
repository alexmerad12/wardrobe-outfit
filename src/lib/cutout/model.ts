// Self-hosted background-removal model: BiRefNet-lite (MIT license, the
// official code + weights from ZhengPeng7/BiRefNet_lite), re-exported to ONNX
// by scripts/cutout/export_birefnet_lite_lean.py. Chosen 2026-10-15 after a
// 12-photo benchmark against Photoroom on Linette's own wardrobe shots:
// 98.0 % mean mask overlap with Photoroom (worst photo 95.1 %, a belt),
// ahead of BEN2 (97.9 %) and far ahead of ISNet (84.7 %).
//
// Why our own export: the stock ONNX export peaks near 6 GB per 1024 px run
// (the decoder's deformable convolutions turn into gathers over channels x
// 49 taps x pixels) and a Vercel function has 2 GB, so it was killed for
// running out of memory on every photo. The lean export computes the same
// thing tap by tap and skips two full-resolution concats: masks identical to
// the PyTorch model (100.00 % IoU), peak ~1.3 GB.
//
// The weights are NOT in the repo or the function bundle (183 MB). Each
// server instance downloads them once from the project's Vercel Blob store
// (content-addressed URL, verified by SHA-256), caches them in /tmp for the
// rest of the instance's life, and keeps one inference session in memory.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import * as ort from "onnxruntime-node";

export const MODEL_INPUT_SIZE = 1024;

// Errors only: the runtime otherwise logs a warning on every cold start
// because it can't persist a telemetry id on Vercel's read-only home dir.
ort.env.logLevel = "error";

const MODEL_SHA256 = "810d6c62e02551dd96ecb0b9c708fd7fbe2015daf12d73302be44eaf0d608319";
const DEFAULT_MODEL_URL =
  "https://cdxzxqtan3kdtalq.public.blob.vercel-storage.com/models/birefnet-lite-lean-810d6c62e025.onnx";
const CACHE_PATH = path.join(os.tmpdir(), `birefnet-lite-lean-${MODEL_SHA256.slice(0, 12)}.onnx`);
const FS_ERROR_CODES = new Set(["EACCES", "EPERM", "EROFS", "ENOSPC", "EDQUOT", "EMFILE"]);

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function fileHasModelHash(file: string): Promise<boolean> {
  try {
    const hash = createHash("sha256");
    await pipeline(createReadStream(file), hash);
    return hash.digest("hex") === MODEL_SHA256;
  } catch {
    return false; // not cached on this instance yet
  }
}

async function fetchModel(url: string): Promise<Readable> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`cutout model download failed: HTTP ${res.status}`);
  return Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>);
}

// Streams the download into /tmp while hashing it, so the 183 MB never sits
// in the JS heap next to the session's own copy.
async function downloadToCache(url: string): Promise<void> {
  const hash = createHash("sha256");
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  const tmp = `${CACHE_PATH}.${process.pid}.${Date.now()}.part`;
  try {
    await pipeline(await fetchModel(url), tap, createWriteStream(tmp));
    if (hash.digest("hex") !== MODEL_SHA256) throw new Error("cutout model checksum mismatch");
    await rename(tmp, CACHE_PATH);
  } finally {
    await rm(tmp, { force: true });
  }
}

// Fallback when /tmp can't be written: keep the model in memory.
async function downloadToMemory(url: string): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of await fetchModel(url)) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== MODEL_SHA256) {
    throw new Error("cutout model checksum mismatch");
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function modelSource(): Promise<string | Uint8Array> {
  if (await fileHasModelHash(CACHE_PATH)) return CACHE_PATH;
  const url = process.env.CUTOUT_MODEL_URL || DEFAULT_MODEL_URL;
  try {
    await downloadToCache(url);
    return CACHE_PATH;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (!code || !FS_ERROR_CODES.has(code)) throw err;
    return downloadToMemory(url);
  }
}

// Capped: more threads than physical cores made a 10 s run take 40-60 s in
// local tests (oversubscription). Vercel functions have 1-2 vCPUs;
// CUTOUT_THREADS overrides for other hosts.
const INTRA_OP_THREADS =
  Number(process.env.CUTOUT_THREADS) || Math.min(2, Math.max(1, os.availableParallelism()));

const SESSION_OPTIONS: ort.InferenceSession.SessionOptions = {
  intraOpNumThreads: INTRA_OP_THREADS,
  interOpNumThreads: 1,
  executionMode: "sequential",
  // "all" matters: it moves the convolutions to NCHWc kernels. "basic" and
  // "extended" peaked at 3-3.7 GB per run in local tests.
  graphOptimizationLevel: "all",
  // No arena: the ~1 GB a run needs goes back to the OS after each photo
  // instead of staying reserved for the instance's lifetime.
  enableCpuMemArena: false,
  enableMemPattern: false,
  logSeverityLevel: 3,
};

export function getCutoutSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    const t0 = performance.now();
    sessionPromise = modelSource()
      .then(async (source) => {
        const t1 = performance.now();
        const session =
          typeof source === "string"
            ? await ort.InferenceSession.create(source, SESSION_OPTIONS)
            : await ort.InferenceSession.create(source, SESSION_OPTIONS);
        // Once per instance: what a cold start costs, and the CPUs it got.
        console.log(
          `[cutout] session ready: model ${Math.round(t1 - t0)} ms, session ${Math.round(performance.now() - t1)} ms, ` +
            `${INTRA_OP_THREADS} threads, ${os.availableParallelism()} cpus`
        );
        return session;
      })
      .catch((err) => {
        sessionPromise = null; // let the next request retry
        throw err;
      });
  }
  return sessionPromise;
}

/**
 * Run the model on a 1024x1024 RGB image (interleaved 8-bit) and return the
 * raw logits, one per pixel. Not serialized here: cutoutToCatalogJpeg runs
 * one whole photo at a time per instance (two concurrent 1024 px runs double
 * peak memory, and each finishes no sooner than if they took turns).
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
  const feeds = {
    [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]),
  };
  const out = await session.run(feeds);
  const data = out[session.outputNames[0]].data;
  if (data instanceof Float32Array) return data;
  return Float32Array.from(data as ArrayLike<number>);
}
