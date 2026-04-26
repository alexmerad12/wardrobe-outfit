"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { removeBg } from "@/lib/bg-removal";
import { analyzeItem, type AutoFillResult } from "@/lib/analyze-item";
import { dedupeColors, hexToHSL, isNeutralColor } from "@/lib/color-engine";
import { downscaleImage, flattenOntoWhite } from "@/lib/image-utils";
import { convertHeicToJpeg, isHeicFile } from "@/lib/heic-convert";
import { sanitizeAutoFill } from "@/lib/sanitize-autofill";
import { uploadToSupabase, cancelAllActiveUploads } from "@/lib/upload-to-supabase";

// Global background-processing queue for item uploads.
//
// The provider lives above the app router so the pipeline (bg removal →
// upload → AI analyze → save) keeps running when the user navigates between
// pages. Upload from anywhere, immediately go look at your wardrobe, items
// fill in on their own.

export type PendingStage = "queued" | "processing" | "ready" | "error";

export type PendingItem = {
  id: string;
  file: File;
  previewUrl: string;
  stage: PendingStage;
  name?: string;
  category?: string;
  savedItemId?: string;
  error?: string;
};

// Hard cap per batch. Keeping this tight (5) is a reliability win,
// not a limitation: each photo's pipeline has roughly a 5% chance of
// hitting a transient network hiccup on mobile cellular, and the more
// items in flight, the more likely *something* stalls. A 5-item batch
// finishes cleanly in ~15-20s; a 10-item batch was triggering stuck
// tiles more often than users have patience for.
export const MAX_BATCH = 5;

type ContextValue = {
  items: PendingItem[];
  addFiles: (files: FileList | File[]) => { accepted: number; rejected: number };
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  dismissAllFailed: () => void;
  // Clear just the "ready" tiles — used when the user enters the
  // post-upload review wizard, so the strip doesn't still show items
  // the user is actively stepping through.
  clearReady: () => void;
  // Blow away everything. Safety valve for "the upload is stuck and I
  // want to start over." In-flight work is abandoned — tus handles its
  // own cleanup on next page reload.
  cancelAll: () => void;
  // Subscribe to "item saved" events — wardrobe grid uses this to refetch.
  onItemSaved: (listener: () => void) => () => void;
  // Subscribe to "batch finished" — fires exactly once per burst when
  // every in-flight item has settled (ready or error) AND at least one
  // is ready. Consumers only receive events that fire while they're
  // mounted, so a batch that completes while the user is on a different
  // page is silently missed (no retroactive auto-nav).
  onBatchComplete: (listener: (readyItemIds: string[]) => void) => () => void;
};

const Ctx = createContext<ContextValue | null>(null);

export function usePendingUploads(): ContextValue {
  const c = useContext(Ctx);
  if (!c) {
    throw new Error("usePendingUploads must be used within PendingUploadsProvider");
  }
  return c;
}

// Concurrency has to balance throughput vs. reliability on mobile.
// History: 3 → 2 → 1.
// 3 was triggering timeouts on the user's Samsung — three streams
// contending for one weak cell radio. 2 helped but Samsung Internet
// users still saw "Upload network error, no bytes sent" on 4/5 items
// per batch: two same-origin POSTs sharing one HTTP/2 connection,
// one stalls on a Vercel cold-start, the other stream gets reset.
// 1 fully serializes the upload step and matches what the device's
// radio + the platform's cold-start behavior can actually deliver.
// A 5-item batch goes from ~15-20s to ~25-35s — slower-but-completes
// is the right tradeoff for a feature that's worse than useless when
// it fails. Bg-removal and AI-analyze still run in parallel on-device
// per item; this just gates the network handoff.
const CONCURRENCY = 1;

// Hard ceiling per item. Upload's own retry budget is now up to
// 5 × 90 s + ~37 s of backoff ≈ 8 min on a genuinely broken
// connection. Add imgly (up to 3 min) and save retries (up to ~1.5
// min) and the theoretical worst case is ~12 min, but real items
// finish in 10-25 s. We set the outer ceiling to 10 min so the
// upload-retry ladder can fully play out before we give up — cutting
// it off sooner was turning retryable failures (attempt 4 would
// have worked) into permanent red tiles.
const PER_ITEM_TIMEOUT_MS = 10 * 60 * 1000;



function buildItemPayload(imageUrl: string, a: AutoFillResult) {
  const aiColors =
    a.colors?.length
      ? dedupeColors(
          a.colors.map((c, _i, arr) => ({
            hex: c.hex,
            name: c.name,
            percentage: Math.round(100 / arr.length),
          }))
        ).slice(0, 3)
      : [{ hex: "#888888", name: "Gray", percentage: 100 }];
  const dominantHex = aiColors[0].hex;
  return {
    image_url: imageUrl,
    thumbnail_url: null,
    name: a.name ?? "Untitled item",
    category: a.category ?? "top",
    subcategory: a.subcategory ?? null,
    colors: aiColors,
    dominant_color_hsl: hexToHSL(dominantHex),
    is_neutral: isNeutralColor(dominantHex),
    pattern: a.pattern?.length ? a.pattern : ["solid"],
    material: a.material?.length ? a.material : ["cotton"],
    fit: a.fit ?? null,
    bottom_fit: a.bottom_fit ?? null,
    length: a.length ?? null,
    pants_length: a.pants_length ?? null,
    waist_style: a.waist_style ?? null,
    waist_height: a.waist_height ?? null,
    waist_closure: a.waist_closure ?? null,
    belt_compatible: a.belt_compatible ?? false,
    is_layering_piece: a.is_layering_piece ?? false,
    shoe_height: a.shoe_height ?? null,
    heel_type: a.heel_type ?? null,
    shoe_closure: a.shoe_closure ?? null,
    belt_style: a.belt_style ?? null,
    belt_position: null,
    neckline: a.neckline ?? null,
    sleeve_length: a.sleeve_length ?? null,
    closure: a.closure ?? null,
    metal_finish: a.metal_finish ?? null,
    bag_size: a.bag_size ?? null,
    dress_silhouette: a.dress_silhouette ?? null,
    toe_shape: a.toe_shape ?? null,
    formality: a.formality?.length ? a.formality : ["casual"],
    seasons: a.seasons ?? [],
    occasions: a.occasions ?? [],
    warmth_rating:
      typeof a.warmth_rating === "number"
        ? Math.max(1, Math.min(5, Math.round(a.warmth_rating)))
        : 3,
    rain_appropriate: a.rain_appropriate ?? false,
    brand: null,
    is_favorite: false,
  };
}

export function PendingUploadsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const kickedOffRef = useRef<Set<string>>(new Set());
  const savedListenersRef = useRef<Set<() => void>>(new Set());
  const batchCompleteListenersRef = useRef<Set<(ids: string[]) => void>>(
    new Set()
  );
  // Tracks whether the *current* burst has already notified its
  // listeners. Reset when pending empties so the next batch can fire.
  const batchCompletedFiredRef = useRef(false);

  const notifySaved = useCallback(() => {
    for (const listener of savedListenersRef.current) {
      try {
        listener();
      } catch {}
    }
  }, []);

  const onBatchComplete = useCallback(
    (listener: (ids: string[]) => void) => {
      batchCompleteListenersRef.current.add(listener);
      return () => {
        batchCompleteListenersRef.current.delete(listener);
      };
    },
    []
  );

  const patchItem = useCallback((id: string, patch: Partial<PendingItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const processItemOnce = useCallback(
    async (item: PendingItem): Promise<void> => {
      // 0. HEIC → JPEG if needed. Samsung "High Efficiency" mode and
      //    iPhone defaults produce HEIC files that Chrome's canvas /
      //    createImageBitmap can't decode. Without this conversion the
      //    HEIC bytes flow through every step (downscale, bg-removal,
      //    flatten) silently failing and end up uploaded raw, then the
      //    saved item shows a broken-image icon in the wardrobe view.
      const heicLog = (stage: string, extra?: unknown) =>
        console.log(`[bg ${item.id.slice(0, 8)}] ${stage}`, extra ?? "");
      let sourceFile: File = item.file;
      if (isHeicFile(item.file)) {
        heicLog(`HEIC detected — converting to JPEG before pipeline`);
        try {
          sourceFile = await convertHeicToJpeg(item.file);
          heicLog(`HEIC converted`, {
            beforeBytes: item.file.size,
            afterBytes: sourceFile.size,
          });
          // Replace the tile preview so the user sees the converted JPEG
          // (the original HEIC blob URL won't render in <img>).
          const newPreview = URL.createObjectURL(sourceFile);
          const oldPreview = item.previewUrl;
          patchItem(item.id, { previewUrl: newPreview });
          setTimeout(() => URL.revokeObjectURL(oldPreview), 100);
        } catch (err) {
          heicLog("HEIC conversion failed", err);
          throw new Error(
            "Couldn't read this photo (HEIC format unsupported). Try saving as JPEG first."
          );
        }
      }

      // 1. Downscale FIRST so everything downstream sees a sane-sized image.
      //    Phone HEICs can be 20 MB+ and blow Claude's 5 MB image limit, on
      //    top of being slow to upload. Doing this before bg removal also
      //    gives us a safe fallback image if the ML worker throws.
      const downscaled = await downscaleImage(sourceFile, 1600);

      // If the downscale step produced a different blob (e.g. HEIC → JPEG),
      // swap the preview URL. Desktop browsers can't render HEIC, so the
      // original blob URL shows as a broken image until we replace it.
      if (downscaled !== item.file) {
        const oldUrl = item.previewUrl;
        const newUrl = URL.createObjectURL(downscaled);
        patchItem(item.id, { previewUrl: newUrl });
        // Give React a tick to swap in the new URL before revoking the old.
        setTimeout(() => URL.revokeObjectURL(oldUrl), 100);
      }

      // Re-wrap the downscaled blob as a File so AI analyze + imgly
      // see a proper filename + type. Even if downscaling returned
      // the original File unchanged, re-wrapping costs nothing.
      const downOutMime =
        downscaled.type === "image/png" ||
        downscaled.type === "image/jpeg" ||
        downscaled.type === "image/webp"
          ? downscaled.type
          : "image/jpeg";
      const downExt =
        downOutMime === "image/png" ? "png" : downOutMime === "image/webp" ? "webp" : "jpg";
      const baseName = item.file.name.replace(/\.[^.]+$/, "") || "item";
      const downscaledFile = new File(
        [downscaled],
        `${baseName}.${downExt}`,
        { type: downOutMime }
      );

      // 2. imgly bg removal + Claude analyze, run SEQUENTIALLY.
      //    Earlier this was Promise.all to overlap the on-device
      //    bg-removal with the server round-trip, but on a 4 GB
      //    Android 10 device that overlap was the actual cause of
      //    the 'Upload network error, no bytes sent' failures users
      //    were seeing. The combination of (a) bg-removal's ~50 MB
      //    ML model, (b) a decoded full-resolution bitmap held in
      //    memory, and (c) a parallel multipart fetch buffering a
      //    multi-MB body was pushing the browser past what the OS
      //    could allocate — `createImageBitmap` would fail, the
      //    fetch and XHR would refuse to even start (TypeError /
      //    onerror within 30 ms of send), and the user just saw
      //    'Failed' on every tile. Diagnostic at /debug-upload
      //    proved the network and pipeline both work in isolation;
      //    only the parallel combination breaks. Sequential keeps
      //    peak memory roughly halved and the failure mode
      //    disappears. Costs ~3-5 s of wall-clock per item — a
      //    fine tradeoff for actually completing.
      const bgLog = (stage: string, extra?: unknown) =>
        console.log(`[bg ${item.id.slice(0, 8)}] ${stage}`, extra ?? "");
      const t0 = performance.now();
      bgLog("starting imgly bg-removal");
      const cleanedOrNull = await removeBg(downscaledFile).catch((err) => {
        bgLog("imgly failed — keeping original", err);
        return null;
      });
      bgLog("starting Claude analyze");
      const attrsRaw = await analyzeItem(downscaledFile).catch((err) => {
        console.warn(`[pending ${item.id}] analyze failed, using defaults`, err);
        return {} as AutoFillResult;
      });
      const attrs = sanitizeAutoFill(attrsRaw);

      // 3. Pick the final image: cleaned PNG if imgly worked, raw
      //    downscaled otherwise. Swap the tile preview so the user
      //    sees the white-bg version appear before the redirect.
      //    IMPORTANT: when imgly succeeds, we flatten the transparent
      //    PNG onto white and re-encode as JPEG before uploading.
      //    Imgly's raw output is routinely 2-3 MB at 1600 px because
      //    PNG compresses transparency poorly — that file size was
      //    starving both the direct-upload path (Samsung's CORS
      //    preflight bug compounds with large bodies) and the proxy
      //    fallback (3 MB through Vercel's 4.5 MB Hobby body limit
      //    + 10 s function timeout was failing in the wild). Wardrobe
      //    photos never actually need transparency — every consumer
      //    renders them on a light background — so baking in white
      //    is loss-free in the user's eyes and 5-10× smaller on disk.
      let finalFile: File;
      if (cleanedOrNull) {
        bgLog(`imgly done in ${Math.round(performance.now() - t0)}ms`, {
          size: cleanedOrNull.size,
        });
        const flattened = await flattenOntoWhite(cleanedOrNull, 1280, 0.88);
        bgLog(`flattened to JPEG`, {
          beforeBytes: cleanedOrNull.size,
          afterBytes: flattened.size,
          ratio:
            cleanedOrNull.size > 0
              ? `${((flattened.size / cleanedOrNull.size) * 100).toFixed(0)}%`
              : "n/a",
        });
        const cleanedPreview = URL.createObjectURL(flattened);
        const oldPreview = item.previewUrl;
        patchItem(item.id, { previewUrl: cleanedPreview });
        setTimeout(() => URL.revokeObjectURL(oldPreview), 100);
        finalFile = new File([flattened], `${baseName}.jpg`, {
          type: "image/jpeg",
        });
      } else {
        finalFile = downscaledFile;
      }

      // Final size guard. Vercel Hobby rejects request bodies > 4.5 MB
      // at the edge — the function never runs, the connection is reset
      // before any byte is read, and XHR surfaces it as "Upload network
      // error, no bytes sent" with no further detail. That's the
      // deterministic "same photo always fails" failure mode.
      // It hits when BOTH (a) bg-removal failed (so we're on the
      // downscale fallback) and (b) downscaleImage's createImageBitmap
      // call also failed on the same source (broken EXIF, an HEIC
      // variant the browser can't decode, low-memory device under
      // load) — in which case downscaleImage silently passes the raw
      // 4-8 MB camera file straight through. Re-encode here as the
      // backstop so nothing oversized reaches the wire.
      // Cascading size guard. /api/upload (Vercel proxy) rejects bodies
      // over 4.5 MB at the edge ("no bytes sent" error). Try multiple
      // shrink strategies in order of preference; bail with a clear
      // error before the upload if every strategy fails on this device.
      const SAFE_UPLOAD_SIZE = 2_000_000;
      const HARD_UPLOAD_LIMIT = 4_000_000;
      if (finalFile.size > SAFE_UPLOAD_SIZE) {
        bgLog(`finalFile too large — trying shrink fallback`, {
          beforeBytes: finalFile.size,
        });
        const shrinkAttempts: { tag: string; fn: () => Promise<Blob> }[] = [
          { tag: "flatten 1280/0.85", fn: () => flattenOntoWhite(finalFile, 1280, 0.85) },
          { tag: "flatten 1024/0.7", fn: () => flattenOntoWhite(finalFile, 1024, 0.7) },
          { tag: "downscale 800/0.7", fn: () => downscaleImage(finalFile, 800) },
          { tag: "downscale 600/0.6", fn: () => downscaleImage(finalFile, 600) },
        ];
        for (const { tag, fn } of shrinkAttempts) {
          try {
            const shrunk = await fn();
            if (shrunk.size <= HARD_UPLOAD_LIMIT) {
              finalFile = new File([shrunk], `${baseName}.jpg`, { type: "image/jpeg" });
              bgLog(`re-encoded via ${tag}`, { afterBytes: finalFile.size });
              break;
            }
            bgLog(`${tag} still too big`, { size: shrunk.size });
          } catch (err) {
            bgLog(`${tag} failed`, err);
          }
        }
        // If we still have an oversized file, fail explicitly rather
        // than send 5+ MB to /api/upload and get a meaningless
        // "no bytes sent" error.
        if (finalFile.size > HARD_UPLOAD_LIMIT) {
          throw new Error(
            "Image too large to upload from this device. Try a smaller photo or use a desktop browser."
          );
        }
      }

      // 4. Single upload + single save. Previously we did 2 uploads
      //    (raw + cleaned) and 2 DB writes (POST + PATCH) per item;
      //    uploading only the final image cuts ~3-5s of network I/O
      //    per item.
      bgLog("uploading final image", {
        size: finalFile.size,
        type: finalFile.type,
      });
      const uploadT0 = performance.now();
      // Don't re-wrap the error with another "Upload:" prefix — the
      // upload helper already prefixes its errors, and doubling them
      // up produced "Upload: Upload: Failed to fetch" in the user-
      // facing error panel, which was confusing.
      const imageUrl = await uploadToSupabase(finalFile).catch((err) => {
        console.error(`[pending ${item.id}] upload step failed`, err);
        throw err;
      });
      bgLog(`upload done in ${Math.round(performance.now() - uploadT0)}ms`);

      // Save with the same retry strategy as upload — the DB write
      // can also drop under transient network/server stress and we
      // don't want a tile to turn red just because a 503 came back
      // on attempt 1.
      const savePayload = JSON.stringify(buildItemPayload(imageUrl, attrs));
      const saved = await (async () => {
        const delays = [1_000, 3_000];
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch("/api/items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: savePayload,
            });
            if (res.ok) return (await res.json()) as { id: string };
            const text = await res.text().catch(() => "");
            const permanent = [400, 401, 403, 404, 413, 415].includes(
              res.status
            );
            if (permanent || attempt === 3) {
              console.error(`[pending ${item.id}] save failed`, {
                status: res.status,
                response: text,
              });
              throw new Error(
                `Save (${res.status})${text ? `: ${text.slice(0, 140)}` : ""}`
              );
            }
            console.warn(
              `[pending ${item.id}] save attempt ${attempt} returned ${res.status}, retrying`
            );
          } catch (err) {
            lastErr = err;
            if (attempt === 3) throw err;
            const isNetwork =
              err instanceof TypeError ||
              (err instanceof DOMException && err.name === "AbortError");
            if (!isNetwork && err instanceof Error && /^Save /.test(err.message)) {
              // Already a thrown Save-error we intend to propagate.
              throw err;
            }
            console.warn(
              `[pending ${item.id}] save attempt ${attempt} threw, retrying`,
              err
            );
          }
          await new Promise((r) =>
            setTimeout(r, delays[attempt - 1] ?? 3_000)
          );
        }
        throw lastErr instanceof Error ? lastErr : new Error("Save failed");
      })();
      bgLog(`DONE in ${Math.round(performance.now() - t0)}ms total`);

      patchItem(item.id, {
        stage: "ready",
        name: attrs.name ?? "Untitled item",
        category: attrs.category ?? undefined,
        savedItemId: saved.id,
      });
      notifySaved();
    },
    [patchItem, notifySaved]
  );

  // Per-item timeout wrapper. Races the real work against a timer;
  // whichever settles first wins. Without this a hung Claude call or a
  // wedged upload would leave an item in "processing" forever and
  // block later items (with concurrency=3 that means the whole queue
  // can stall on three bad apples).
  const withTimeout = useCallback(
    <T,>(work: Promise<T>, label: string): Promise<T> => {
      return Promise.race([
        work,
        new Promise<T>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error(`${label} timed out`)),
            PER_ITEM_TIMEOUT_MS
          )
        ),
      ]);
    },
    []
  );

  const processItem = useCallback(
    async (item: PendingItem) => {
      patchItem(item.id, { stage: "processing" });
      try {
        await withTimeout(processItemOnce(item), "Item");
      } catch (err) {
        // Single attempt. If it fails, mark the tile error immediately.
        // The user taps Retry to try again — that's clearer than silent
        // 2-attempt backoff loops that just look like the app is hung.
        console.error(`[pending ${item.id}] upload failed`, err);
        patchItem(item.id, {
          stage: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [processItemOnce, patchItem, withTimeout]
  );

  // Capacity gate: run up to CONCURRENCY items at a time.
  useEffect(() => {
    const inFlight = items.filter((i) => i.stage === "processing").length;
    const queue = items.filter(
      (i) => i.stage === "queued" && !kickedOffRef.current.has(i.id)
    );
    const capacity = Math.max(0, CONCURRENCY - inFlight);
    for (const it of queue.slice(0, capacity)) {
      kickedOffRef.current.add(it.id);
      void processItem(it);
    }
  }, [items, processItem]);

  // Warn the user before they close the tab while uploads are still in
  // flight — the context lives in memory only, so closing the window
  // really does drop any unsaved work. Route-level navigation inside the
  // app is fine because the provider lives above the router.
  useEffect(() => {
    const hasActiveWork = items.some(
      (i) => i.stage === "queued" || i.stage === "processing"
    );
    if (!hasActiveWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [items]);

  // Fire the batch-complete event exactly once per burst, the moment
  // every in-flight item settles. Listeners only receive the event if
  // they're currently mounted — so a batch completing while the user is
  // on /profile is silently missed instead of yanking them into the
  // wizard when they next return to /wardrobe.
  useEffect(() => {
    if (items.length === 0) {
      batchCompletedFiredRef.current = false;
      return;
    }
    const settled = items.every(
      (i) => i.stage === "ready" || i.stage === "error"
    );
    const readyIds = items
      .filter((i) => i.stage === "ready" && i.savedItemId)
      .map((i) => i.savedItemId!);
    if (settled && readyIds.length > 0 && !batchCompletedFiredRef.current) {
      batchCompletedFiredRef.current = true;
      for (const listener of batchCompleteListenersRef.current) {
        try {
          listener(readyIds);
        } catch {}
      }
    }
  }, [items]);

  // Auto-dismiss "ready" items a while after they complete. Long enough
  // for the user to hit "Review items" while they're still on-screen, short
  // enough that the strip doesn't accumulate forever. Leaves error items
  // for retry.
  useEffect(() => {
    const readyIds = items.filter((i) => i.stage === "ready").map((i) => i.id);
    if (readyIds.length === 0) return;
    const timer = setTimeout(() => {
      setItems((prev) =>
        prev.filter((i) => {
          const shouldDrop = readyIds.includes(i.id) && i.stage === "ready";
          if (shouldDrop) URL.revokeObjectURL(i.previewUrl);
          return !shouldDrop;
        })
      );
    }, 60_000);
    return () => clearTimeout(timer);
  }, [items]);

  const addFiles = useCallback((files: FileList | File[]) => {
    // Pre-filter to actual images (accept HEIC by extension even when the
    // browser doesn't give it a MIME type).
    const allFiles = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)
    );
    // Cap calculation has to happen inside the functional setItems updater
    // so it sees the latest state — otherwise two file-picker events firing
    // close together both read a stale `items` closure and both accept 10
    // files, blowing past the cap.
    //
    // Side effects (URL.createObjectURL, id generation) live OUTSIDE the
    // updater — React Strict Mode runs the updater twice in dev and we
    // don't want to leak a blob URL per file per render.
    // Build candidate slots with pre-allocated IDs + blob URLs once, so
    // Strict Mode's double-invoke of the setItems updater doesn't
    // allocate new blob URLs on the second pass and leak the first.
    const candidates = allFiles.map((file) => ({
      file,
      key: `${file.name}:${file.size}:${file.lastModified}`,
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      previewUrl: URL.createObjectURL(file),
    }));

    let accepted = 0;
    let rejected = 0;
    setItems((prev) => {
      const knownKeys = new Set(
        prev.map((i) => `${i.file.name}:${i.file.size}:${i.file.lastModified}`)
      );
      const activeCount = prev.filter(
        (i) => i.stage !== "ready" && i.stage !== "error"
      ).length;
      let remainingCapacity = Math.max(0, MAX_BATCH - activeCount);
      const incoming: PendingItem[] = [];
      let localAccepted = 0;
      let localRejected = 0;
      for (const c of candidates) {
        if (knownKeys.has(c.key)) {
          // Already in state — don't leak its blob URL.
          URL.revokeObjectURL(c.previewUrl);
          continue;
        }
        if (remainingCapacity <= 0) {
          URL.revokeObjectURL(c.previewUrl);
          localRejected++;
          continue;
        }
        knownKeys.add(c.key);
        remainingCapacity--;
        localAccepted++;
        incoming.push({
          id: c.id,
          file: c.file,
          previewUrl: c.previewUrl,
          stage: "queued",
        });
      }
      // Only write back when we actually committed incoming items.
      // Strict Mode invokes the updater twice in dev: the first call
      // sees prev=[] and accepts everything; the second call sees
      // prev already containing those items (via knownKeys) and
      // rejects everything as duplicates. Without this guard the
      // second pass clobbers `accepted` back to 0, and the caller's
      // "if (accepted > 0) router.push(...)" silently becomes a
      // no-op — so the user picks files and nothing happens.
      if (incoming.length > 0) {
        accepted = localAccepted;
        rejected = localRejected;
        return [...incoming, ...prev];
      }
      return prev;
    });
    return { accepted, rejected };
  }, []);

  const retry = useCallback((id: string) => {
    kickedOffRef.current.delete(id);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, stage: "queued", error: undefined } : i
      )
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const dismissAllFailed = useCallback(() => {
    setItems((prev) => {
      for (const i of prev) {
        if (i.stage === "error") URL.revokeObjectURL(i.previewUrl);
      }
      return prev.filter((i) => i.stage !== "error");
    });
  }, []);

  const clearReady = useCallback(() => {
    setItems((prev) => {
      for (const i of prev) {
        if (i.stage === "ready") URL.revokeObjectURL(i.previewUrl);
      }
      return prev.filter((i) => i.stage !== "ready");
    });
  }, []);

  const cancelAll = useCallback(() => {
    // Abort any tus uploads that are mid-chunk — otherwise they'd keep
    // streaming to Supabase after "cancel" and write DB rows the user
    // thought they'd thrown away.
    cancelAllActiveUploads();
    setItems((prev) => {
      for (const i of prev) URL.revokeObjectURL(i.previewUrl);
      return [];
    });
    kickedOffRef.current.clear();
    batchCompletedFiredRef.current = false;
  }, []);

  const onItemSaved = useCallback((listener: () => void) => {
    savedListenersRef.current.add(listener);
    return () => {
      savedListenersRef.current.delete(listener);
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        items,
        addFiles,
        retry,
        dismiss,
        dismissAllFailed,
        clearReady,
        cancelAll,
        onItemSaved,
        onBatchComplete,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
