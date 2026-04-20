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
import { createClient } from "@/lib/supabase/client";
import { dedupeColors, hexToHSL, isNeutralColor } from "@/lib/color-engine";
import { downscaleImage } from "@/lib/image-utils";

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

type ContextValue = {
  items: PendingItem[];
  addFiles: (files: FileList | File[]) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
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

const CONCURRENCY = 3;

async function uploadImage(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Not signed in");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${session.user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage
    .from("clothing-images")
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from("clothing-images").getPublicUrl(path).data.publicUrl;
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

      // 2. Background removal in the worker. If it fails, keep going with
      //    the downscaled original — a decent result beats a blocked save.
      const cleanedBlob = await removeBg(downscaled).catch(() => downscaled);
      const cleaned = new File(
        [cleanedBlob],
        item.file.name.replace(/\.[^.]+$/, "") + ".png",
        { type: "image/png" }
      );

      // 3. Upload + analyze in parallel on the cleaned, downscaled image.
      const [imageUrl, attrs] = await Promise.all([
        uploadImage(cleaned),
        analyzeItem(cleaned).catch(() => ({} as AutoFillResult)),
      ]);

      // 4. Save to DB.
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildItemPayload(imageUrl, attrs)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status})${text ? `: ${text.slice(0, 80)}` : ""}`);
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
        // One automatic retry after a short backoff covers most transient
        // failures: flaky Wi-Fi, a Claude 429, a Supabase 503.
        await new Promise((r) => setTimeout(r, 1500));
        try {
          await processItemOnce(item);
        } catch (secondErr) {
          const err = secondErr instanceof Error ? secondErr : firstErr;
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

  // Auto-dismiss "ready" items a moment after they complete, so the pending
  // tray doesn't grow forever after a batch. Leaves error items for retry.
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
    }, 4000);
    return () => clearTimeout(timer);
  }, [items]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming: PendingItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      incoming.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        stage: "queued",
      });
    }
    if (incoming.length === 0) return;
    setItems((prev) => [...incoming, ...prev]);
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

  const onItemSaved = useCallback((listener: () => void) => {
    savedListenersRef.current.add(listener);
    return () => {
      savedListenersRef.current.delete(listener);
    };
  }, []);

  return (
    <Ctx.Provider value={{ items, addFiles, retry, dismiss, onItemSaved }}>
      {children}
    </Ctx.Provider>
  );
}
