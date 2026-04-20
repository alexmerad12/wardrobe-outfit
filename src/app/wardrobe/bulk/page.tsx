"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { preloadBgRemoval, removeBg } from "@/lib/bg-removal";
import { analyzeItem, type AutoFillResult } from "@/lib/analyze-item";
import { hexToHSL, isNeutralColor, dedupeColors } from "@/lib/color-engine";

type Stage = "queued" | "processing" | "ready" | "error";

type BulkItem = {
  id: string;
  file: File;
  previewUrl: string;
  stage: Stage;
  name?: string;
  category?: string;
  savedItemId?: string;
  error?: string;
};

const CONCURRENCY = 3;

async function uploadImage(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Not signed in");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
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
          a.colors.map((c, _, arr) => ({
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

export default function BulkUploadPage() {
  const router = useRouter();
  const [items, setItems] = useState<BulkItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kickedOffRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Warm the bg-removal model once for the whole batch
    preloadBgRemoval();
  }, []);

  // Free blob URLs when leaving the page
  useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<BulkItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const processItem = useCallback(
    async (item: BulkItem) => {
      updateItem(item.id, { stage: "processing" });
      try {
        // Stage 1: background removal (Web Worker, never blocks the page).
        const cleanedBlob = await removeBg(item.file).catch(() => item.file);
        const cleaned = new File(
          [cleanedBlob],
          item.file.name.replace(/\.[^.]+$/, "") + ".png",
          { type: "image/png" }
        );

        // Stage 2: upload + analyze in parallel on the cleaned image.
        const [imageUrl, attrs] = await Promise.all([
          uploadImage(cleaned),
          analyzeItem(cleaned).catch(() => ({} as AutoFillResult)),
        ]);

        // Stage 3: save straight to DB with AI data. Item now lives in the
        // wardrobe — user can leave this page at any time without losing it.
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildItemPayload(imageUrl, attrs)),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const saved = (await res.json()) as { id: string };

        updateItem(item.id, {
          stage: "ready",
          name: attrs.name ?? "Untitled item",
          category: attrs.category ?? "item",
          savedItemId: saved.id,
        });
      } catch (err) {
        updateItem(item.id, {
          stage: "error",
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    },
    [updateItem]
  );

  // Concurrency gate: kick off new queued items as capacity opens up.
  useEffect(() => {
    const inFlight = items.filter((i) => i.stage === "processing").length;
    const queued = items.filter(
      (i) => i.stage === "queued" && !kickedOffRef.current.has(i.id)
    );
    const capacity = Math.max(0, CONCURRENCY - inFlight);
    const toStart = queued.slice(0, capacity);
    for (const item of toStart) {
      kickedOffRef.current.add(item.id);
      void processItem(item);
    }
  }, [items, processItem]);

  function handleFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newItems: BulkItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      newItems.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        stage: "queued",
      });
    }
    setItems((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function retryItem(item: BulkItem) {
    kickedOffRef.current.delete(item.id);
    updateItem(item.id, { stage: "queued", error: undefined });
  }

  const counts = useMemo(() => {
    let ready = 0,
      processing = 0,
      queued = 0,
      error = 0;
    for (const i of items) {
      if (i.stage === "ready") ready++;
      else if (i.stage === "processing") processing++;
      else if (i.stage === "queued") queued++;
      else if (i.stage === "error") error++;
    }
    return { ready, processing, queued, error, total: items.length };
  }, [items]);

  const allDone = counts.total > 0 && counts.ready + counts.error === counts.total;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-medium">Bulk upload</h1>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
            <Sparkles className="h-7 w-7 text-purple-600" />
          </div>
          <h2 className="text-base font-medium mb-1">Upload a batch at once</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Pick as many photos as you want. Yav will remove the background,
            read every detail, and save each one to your wardrobe — you can
            leave this page any time.
          </p>
          <Button
            size="lg"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="h-4 w-4" />
            Select photos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesChosen(e.target.files)}
          />
        </div>
      )}

      {/* Progress summary */}
      {items.length > 0 && (
        <div className="mb-4 rounded-xl bg-purple-50 px-4 py-3 text-sm text-purple-900">
          <div className="flex items-center gap-2">
            {allDone ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <span className="font-medium">
              {allDone
                ? `All ${counts.total} item${counts.total === 1 ? "" : "s"} added to your wardrobe`
                : `${counts.ready} of ${counts.total} ready · ${counts.processing + counts.queued} in progress`}
            </span>
          </div>
          {!allDone && (
            <p className="mt-1 text-xs text-purple-700/80">
              You can leave this page any time — items are saved as they finish.
            </p>
          )}
        </div>
      )}

      {/* Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <BulkCard key={item.id} item={item} onRetry={() => retryItem(item)} />
          ))}

          {/* Add-more tile */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex flex-col items-center justify-center text-muted-foreground hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            <Plus className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Add more</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesChosen(e.target.files)}
          />
        </div>
      )}

      {/* Bottom actions when all done */}
      {allDone && (
        <div className="fixed bottom-20 inset-x-4 sm:static sm:mt-6">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push("/wardrobe")}
          >
            Go to wardrobe
          </Button>
        </div>
      )}
    </div>
  );
}

function BulkCard({ item, onRetry }: { item: BulkItem; onRetry: () => void }) {
  const content = (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={item.name ?? "Clothing item"}
        className="h-full w-full object-cover"
      />

      {/* Overlay by stage */}
      {(item.stage === "queued" || item.stage === "processing") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[11px] font-medium">
            {item.stage === "processing" ? "Working…" : "Queued"}
          </span>
        </div>
      )}
      {item.stage === "ready" && (
        <div className="absolute top-2 right-2 rounded-full bg-green-500 p-1 text-white shadow-sm">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
      )}
      {item.stage === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-950/60 text-white">
          <AlertCircle className="h-5 w-5" />
          <span className="text-[11px] font-medium">Failed</span>
        </div>
      )}

      {/* Caption */}
      {item.stage === "ready" && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
          <p className="truncate text-xs font-medium">{item.name}</p>
          {item.category && (
            <p className="truncate text-[10px] opacity-80 capitalize">{item.category}</p>
          )}
        </div>
      )}
    </div>
  );

  if (item.stage === "ready" && item.savedItemId) {
    return (
      <Link href={`/wardrobe/${item.savedItemId}`} className="block">
        {content}
      </Link>
    );
  }
  if (item.stage === "error") {
    return (
      <button type="button" onClick={onRetry} className="block w-full text-left">
        {content}
      </button>
    );
  }
  return content;
}
