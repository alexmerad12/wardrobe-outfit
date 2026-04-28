"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type AutoFillResult } from "@/lib/analyze-item";
import { dedupeColors, hexToHSL, isNeutralColor } from "@/lib/color-engine";
import { convertHeicToJpeg, isHeicFileDeep } from "@/lib/heic-convert";
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
      const bgLog = (stage: string, extra?: unknown) =>
        console.log(`[bulk ${item.id.slice(0, 8)}] ${stage}`, extra ?? "");
      const t0 = performance.now();

      // 0. HEIC → JPEG client-side if needed. Samsung "High Efficiency"
      //    + iPhone defaults produce HEIC; even Supabase Storage will
      //    accept the bytes but the browser <img> tag can't render them
      //    without conversion. heic2any handles this in-browser.
      let sourceFile: File = item.file;
      const heicHit = await isHeicFileDeep(item.file);
      bgLog(`type="${item.file.type}" name="${item.file.name}" size=${item.file.size} heic=${heicHit}`);
      if (heicHit) {
        bgLog("HEIC detected — converting to JPEG before pipeline");
        try {
          sourceFile = await convertHeicToJpeg(item.file);
          bgLog("HEIC converted", {
            beforeBytes: item.file.size,
            afterBytes: sourceFile.size,
          });
          const newPreview = URL.createObjectURL(sourceFile);
          const oldPreview = item.previewUrl;
          patchItem(item.id, { previewUrl: newPreview });
          setTimeout(() => URL.revokeObjectURL(oldPreview), 100);
        } catch (err) {
          bgLog("HEIC conversion failed", err);
          throw new Error(
            "Couldn't read this photo (HEIC format unsupported). Try saving as JPEG first."
          );
        }
      }

      // 1. Direct upload of the (HEIC-converted if needed) original to
      //    Supabase Storage. This bypasses Vercel's 4.5 MB body limit
      //    and skips every client-side canvas operation that's been
      //    failing on Samsung Chrome (downscale, imgly bg-removal,
      //    flatten, cascading shrink). Supabase Storage accepts up to
      //    50 MB so any phone photo fits.
      bgLog("uploading raw to Supabase");
      const rawUploadT0 = performance.now();
      const rawUrl = await uploadToSupabase(sourceFile);
      bgLog(`raw upload done in ${Math.round(performance.now() - rawUploadT0)}ms`);

      const pathMatch = rawUrl.match(/\/object\/public\/clothing-images\/(.+)$/);
      if (!pathMatch) {
        throw new Error("couldn't parse upload path from Supabase URL");
      }
      const sourcePath = pathMatch[1];

      // 2. Server-side processing in parallel:
      //      - normalize: Photoroom bg-removal + sharp resize + flatten
      //                   onto white, overwrites same Supabase path
      //      - analyze:   Gemini classifies the original photo (more
      //                   context than the bg-removed version)
      //    Both take just the URL, so neither hits Vercel's 4.5 MB
      //    body cap. Server has libvips and gigs of memory — none of
      //    the canvas / Mali GPU / Chrome heap limits that bite mobile.
      bgLog("starting parallel server normalize + analyze");
      const serverT0 = performance.now();
      const [normalizeResult, attrsRaw] = await Promise.all([
        fetch("/api/items/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl: rawUrl, sourcePath }),
        }).then(async (res) => {
          if (!res.ok) {
            const errBody = (await res.json().catch(() => ({}))) as {
              error?: string;
              detail?: string;
            };
            throw new Error(
              `normalize ${res.status}: ${errBody.detail || errBody.error || ""}`
            );
          }
          return res.json() as Promise<{ url: string; bytes: number }>;
        }),
        fetch("/api/items/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl: rawUrl }),
        }).then(async (res) => {
          if (!res.ok) {
            console.warn(
              `[pending ${item.id}] analyze failed (${res.status}), using defaults`
            );
            return {} as AutoFillResult;
          }
          return res.json() as Promise<AutoFillResult>;
        }),
      ]);
      bgLog(
        `server processing done in ${Math.round(performance.now() - serverT0)}ms`,
        { bytes: normalizeResult.bytes }
      );

      // 3. Refresh tile preview to the normalized (white-bg) image.
      //    The URL the server returned ALREADY has ?v=timestamp baked
      //    in for cache-busting — don't append another `?t=`, that
      //    produces a double-`?` invalid URL that 404s and renders
      //    the tile as blank/white.
      try {
        const cleanedRes = await fetch(normalizeResult.url);
        if (cleanedRes.ok) {
          const cleanedBlob = await cleanedRes.blob();
          const cleanedPreview = URL.createObjectURL(cleanedBlob);
          const oldPreview = item.previewUrl;
          patchItem(item.id, { previewUrl: cleanedPreview });
          setTimeout(() => URL.revokeObjectURL(oldPreview), 100);
        }
      } catch (err) {
        bgLog("tile preview refresh failed (non-fatal)", err);
      }

      const attrs = sanitizeAutoFill(attrsRaw);
      const imageUrl = normalizeResult.url;

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
  //
  // Spacing between items: previously items kicked off back-to-back the
  // moment the prior one finished. Sequential 5-7 MB multipart POSTs to
  // Supabase Storage on the same TCP connection were getting reset
  // (browser surfaces it as TypeError "Failed to fetch") on roughly 2/5
  // items per batch — the CDN appears to throttle / reset rapid uploads
  // from the same client. A small gap before kicking off each
  // subsequent item gives the connection state time to settle and lets
  // the keep-alive idle out instead of being reused at exactly the
  // wrong moment. The first item in a batch goes immediately.
  const lastKickoffRef = useRef<number>(0);
  const ITEM_KICKOFF_GAP_MS = 1_200;
  useEffect(() => {
    const inFlight = items.filter((i) => i.stage === "processing").length;
    const queue = items.filter(
      (i) => i.stage === "queued" && !kickedOffRef.current.has(i.id)
    );
    const capacity = Math.max(0, CONCURRENCY - inFlight);
    if (capacity === 0 || queue.length === 0) return;

    const since = performance.now() - lastKickoffRef.current;
    const wait = lastKickoffRef.current === 0 || since >= ITEM_KICKOFF_GAP_MS
      ? 0
      : ITEM_KICKOFF_GAP_MS - since;

    const timer = setTimeout(() => {
      for (const it of queue.slice(0, capacity)) {
        kickedOffRef.current.add(it.id);
        lastKickoffRef.current = performance.now();
        void processItem(it);
      }
    }, wait);
    return () => clearTimeout(timer);
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

  // Auto-retry errored items once when the tab comes back into focus.
  // Common case: user kicked off a batch, switched to another app while
  // it ran, network blipped on one item, user returns to the tab — we
  // silently retry that item before they even see the error tile. Each
  // item is auto-retried at most once per error to avoid loops; if it
  // fails again, the user has to tap retry manually.
  const autoRetriedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onVisible = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      setItems((prev) => {
        let changed = false;
        const next = prev.map((i) => {
          if (i.stage !== "error") return i;
          if (autoRetriedRef.current.has(i.id)) return i;
          autoRetriedRef.current.add(i.id);
          kickedOffRef.current.delete(i.id);
          changed = true;
          return { ...i, stage: "queued" as const, error: undefined };
        });
        return changed ? next : prev;
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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
    autoRetriedRef.current.clear();
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
