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
import { downscaleImage } from "@/lib/image-utils";
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

// Uploads now use tus.io resumable uploads, which survive TCP drops
// by resuming from the last ACKed byte. With that reliability layer in
// place we can parallelise again — 3 is the sweet spot per the tus +
// mobile-network literature (more streams over a weak cell radio make
// every stream slower).
const CONCURRENCY = 3;

// Hard ceiling per item. No auto-retry, no tus protocol backoff — a
// normal small-JPEG upload takes 2-5 s, Claude analyze 1-3 s. 45 s is
// comfortably above the p95 happy path; anything slower is genuinely
// broken and should error out so the user can see the red tile and
// tap to retry manually.
const PER_ITEM_TIMEOUT_MS = 45_000;



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
      // 1. Downscale FIRST so everything downstream sees a sane-sized image.
      //    Phone HEICs can be 20 MB+ and blow Claude's 5 MB image limit, on
      //    top of being slow to upload. Doing this before bg removal also
      //    gives us a safe fallback image if the ML worker throws.
      const downscaled = await downscaleImage(item.file, 1600);

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

      // Background removal is SKIPPED in the bulk pipeline. imgly's
      // on-device ISNet model costs 3-8 seconds per image on mobile
      // CPU — multiplied by a 6-item batch that's 30-50 seconds of
      // pure waiting on top of uploads, which is why the app feels
      // "god awful slow" vs Acloset (which uses hardware-accelerated
      // Android ML Kit in native code — an API no web browser can
      // reach). imgly was also the most common hang point: its worker
      // deadlocks under rapid messages, leaving the queue frozen.
      //
      // The user can still clean a specific photo's background via
      // the "Remove background" button on /wardrobe/[id] if they care
      // about a particular item. Bulk upload stays fast.
      const cleanedBlob = downscaled;
      const outMime =
        cleanedBlob.type === "image/png" ||
        cleanedBlob.type === "image/jpeg" ||
        cleanedBlob.type === "image/webp"
          ? cleanedBlob.type
          : "image/jpeg";
      const ext = outMime === "image/png" ? "png" : outMime === "image/webp" ? "webp" : "jpg";
      const baseName = item.file.name.replace(/\.[^.]+$/, "") || "item";
      const cleaned = new File([cleanedBlob], `${baseName}.${ext}`, { type: outMime });

      // 3. Upload + analyze in parallel on the cleaned, downscaled image.
      const [imageUrl, attrsRaw] = await Promise.all([
        uploadToSupabase(cleaned).catch((err) => {
          console.error(`[pending ${item.id}] upload step failed`, err);
          throw new Error(
            `Upload: ${err instanceof Error ? err.message : String(err)}`
          );
        }),
        analyzeItem(cleaned).catch((err) => {
          console.warn(`[pending ${item.id}] analyze step failed, using defaults`, err);
          return {} as AutoFillResult;
        }),
      ]);
      // Belt-and-braces sanitise — server already strips invalid enums,
      // but this guards against older deploys or any intermediate code
      // path that skipped validation.
      const attrs = sanitizeAutoFill(attrsRaw);

      // 4. Save to DB.
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildItemPayload(imageUrl, attrs)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[pending ${item.id}] save failed`, {
          status: res.status,
          response: text,
          attrs,
          payload: buildItemPayload(imageUrl, attrs),
        });
        throw new Error(
          `Save (${res.status})${text ? `: ${text.slice(0, 140)}` : ""}`
        );
      }
      const saved = (await res.json()) as { id: string };

      patchItem(item.id, {
        stage: "ready",
        name: attrs.name ?? "Untitled item",
        category: attrs.category ?? undefined,
        savedItemId: saved.id,
      });
      notifySaved();

      // Post-save background removal — runs async so the pipeline's
      // wall-clock is unchanged. Item is already "ready" with its
      // original image; when imgly finishes we upload the cleaned
      // version and PATCH image_url. Wardrobe grids that are
      // listening refetch and see the new image. If removal fails or
      // times out, we just keep the original — no pipeline impact.
      const downscaledFile = cleaned; // captured for the closure below
      const bgLog = (stage: string, extra?: unknown) =>
        console.log(`[bg ${item.id.slice(0, 8)}] ${stage}`, extra ?? "");
      void (async () => {
        bgLog("starting imgly removeBg");
        const t0 = performance.now();
        try {
          const cleanedBlob = await removeBg(downscaledFile);
          bgLog(`imgly done in ${Math.round(performance.now() - t0)}ms`, {
            size: cleanedBlob.size,
          });
          const cleanedPng = new File(
            [cleanedBlob],
            downscaledFile.name.replace(/\.[^.]+$/, "") + ".png",
            { type: "image/png" }
          );
          bgLog("uploading cleaned PNG");
          const uploadT0 = performance.now();
          const cleanedUrl = await uploadToSupabase(cleanedPng);
          bgLog(`upload done in ${Math.round(performance.now() - uploadT0)}ms`);
          bgLog("PATCHing image_url");
          const patchRes = await fetch(`/api/items/${saved.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: cleanedUrl }),
          });
          if (!patchRes.ok) {
            const txt = await patchRes.text().catch(() => "");
            bgLog(`PATCH failed status=${patchRes.status}`, txt);
            return;
          }
          bgLog(`DONE in ${Math.round(performance.now() - t0)}ms total`);
          // Let subscribers (wardrobe grid) refetch so the cleaned
          // image shows up without a manual reload.
          notifySaved();
        } catch (err) {
          bgLog("FAILED — keeping original", err);
        }
      })();
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
      // Strict Mode runs the updater twice; both runs produce the same
      // output so overwriting these with identical values is safe.
      accepted = localAccepted;
      rejected = localRejected;
      return incoming.length > 0 ? [...incoming, ...prev] : prev;
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
