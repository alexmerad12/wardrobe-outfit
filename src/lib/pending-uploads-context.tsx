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
import { uploadToSupabase } from "@/lib/upload-to-supabase";

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

// No hard cap on batch size. Pick however many; items process serially
// (CONCURRENCY=1) on top of tus-resumable uploads that survive TCP
// drops — the reliability story no longer needs an arbitrary ceiling.
// Acloset and Indyx work the same way: the user picks, the queue
// grinds through. Serialisation + tus is doing the heavy lifting.
export const MAX_BATCH = Infinity;

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
  // Subscribe to "item saved" events — wardrobe grid uses this to refetch.
  onItemSaved: (listener: () => void) => () => void;
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

// Bg removal runs inside a single Web Worker, so only one ML inference can
// actually happen at a time. Serialise at this layer so we never fire three
// concurrent worker messages that all race the same timeout — one image
// being slow used to push the tail of the batch past 3 minutes and trip
// the timeout on items that hadn't even started yet.
let bgChain: Promise<unknown> = Promise.resolve();
function serializedBgRemove(file: Blob): Promise<Blob> {
  const prev = bgChain;
  const next = prev.catch(() => {}).then(() => removeBg(file));
  // Don't let a rejected bg-removal poison the chain for later items.
  bgChain = next.catch(() => {});
  return next;
}


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

  const notifySaved = useCallback(() => {
    for (const listener of savedListenersRef.current) {
      try {
        listener();
      } catch {}
    }
  }, []);

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

      // 2. Background removal in the worker, serialised across all items
      //    so we don't pile up messages inside imgly. If it fails, keep
      //    going with the downscaled original — a decent result beats a
      //    blocked save.
      const cleanedBlob = await serializedBgRemove(downscaled).catch(
        (err) => {
          console.warn(`[pending ${item.id}] bg removal failed, using downscaled original`, err);
          return downscaled;
        }
      );

      // Use the BLOB'S actual MIME type, not a hard-coded PNG. If bg removal
      // fell back to the downscaled JPEG, labeling it as PNG makes Claude's
      // vision API reject it with "invalid image" and Supabase store the
      // file with the wrong Content-Type — both cause uploads to fail.
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
    },
    [patchItem, notifySaved]
  );

  const processItem = useCallback(
    async (item: PendingItem) => {
      patchItem(item.id, { stage: "processing" });
      try {
        await processItemOnce(item);
      } catch (firstErr) {
        console.warn(`[pending ${item.id}] first attempt failed, retrying`, firstErr);
        // One automatic retry after a short backoff covers most transient
        // failures: flaky Wi-Fi, a Claude 429, a Supabase 503.
        await new Promise((r) => setTimeout(r, 1500));
        try {
          await processItemOnce(item);
        } catch (secondErr) {
          const err = secondErr instanceof Error ? secondErr : firstErr;
          console.error(`[pending ${item.id}] both attempts failed`, {
            first: firstErr,
            second: secondErr,
          });
          patchItem(item.id, {
            stage: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }
    },
    [processItemOnce, patchItem]
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
        onItemSaved,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
