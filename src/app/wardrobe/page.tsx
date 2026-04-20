"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClothingItem, Category } from "@/lib/types";
import { ClothingCard, ClothingCardSkeleton } from "@/components/clothing-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  X,
  CheckSquare,
  Combine,
  Archive,
  Camera,
  ImageIcon,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";
import { usePendingUploads, type PendingItem } from "@/lib/pending-uploads-context";

const ALL_CATEGORIES: (Category | "all" | "stored")[] = [
  "all",
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "bag",
  "accessory",
  "stored",
];

export default function WardrobePage() {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | "all" | "stored">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [creatingOutfit, setCreatingOutfit] = useState(false);
  const router = useRouter();
  const { t } = useLocale();

  const { items: pending, addFiles, retry, dismiss, onItemSaved } = usePendingUploads();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const refetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch items:", err);
    }
  }, []);

  useEffect(() => {
    refetchItems().finally(() => setLoading(false));
  }, [refetchItems]);

  // Refetch the grid whenever a background upload saves, so fresh items
  // appear in place of their pending tiles.
  useEffect(() => {
    return onItemSaved(() => {
      void refetchItems();
    });
  }, [onItemSaved, refetchItems]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item${selected.size > 1 ? "s" : ""}?`)) return;

    setDeleting(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/items/${id}`, { method: "DELETE" })
        )
      );
      setItems((prev) => prev.filter((item) => !selected.has(item.id)));
      exitSelectMode();
    } catch (err) {
      console.error("Failed to delete items:", err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateOutfit() {
    if (selected.size < 2) return;
    setCreatingOutfit(true);
    try {
      const res = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          name: null,
          item_ids: Array.from(selected),
          occasions: [],
          seasons: [],
          rating: null,
          is_favorite: true,
          mood: null,
          weather_temp: null,
          weather_condition: null,
          ai_reasoning: null,
          source: "manual",
        }),
      });
      if (res.ok) {
        exitSelectMode();
        router.push("/outfits");
      }
    } catch (err) {
      console.error("Failed to create outfit:", err);
    } finally {
      setCreatingOutfit(false);
    }
  }

  async function handleBulkStore(store: boolean) {
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_stored: store }),
          })
        )
      );
      setItems((prev) =>
        prev.map((item) =>
          selected.has(item.id) ? { ...item, is_stored: store } : item
        )
      );
      exitSelectMode();
    } catch (err) {
      console.error("Failed to store items:", err);
    }
  }

  const storedCount = items.filter((i) => i.is_stored).length;

  const filteredItems =
    activeCategory === "stored"
      ? items.filter((item) => item.is_stored)
      : activeCategory === "all"
      ? items.filter((item) => !item.is_stored)
      : items.filter((item) => item.category === activeCategory && !item.is_stored);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("wardrobe.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {items.filter((i) => !i.is_stored).length} {items.filter((i) => !i.is_stored).length === 1 ? t("wardrobe.items") : t("wardrobe.itemsPlural")}
          </p>
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={selected.size < 2 || creatingOutfit}
                onClick={handleCreateOutfit}
              >
                <Combine className="h-4 w-4" />
                Outfit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={selected.size === 0}
                onClick={() => handleBulkStore(activeCategory !== "stored")}
              >
                <Archive className="h-4 w-4" />
                {activeCategory === "stored" ? "Unstore" : "Store"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={selected.size === 0 || deleting}
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={exitSelectMode}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setSelectMode(true)}
                >
                  <CheckSquare className="h-4 w-4" />
                  Select
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => cameraInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    Take photo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => libraryInputRef.current?.click()}
                    className="gap-2"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Choose from library
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/wardrobe/add")}
                    className="gap-2 text-muted-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Fill in manually
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Camera: single shot straight from the device camera */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  if (cameraInputRef.current) cameraInputRef.current.value = "";
                }}
              />
              {/* Library: multi-select */}
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  if (libraryInputRef.current) libraryInputRef.current.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Category filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {cat === "stored" ? `${t("category.stored")}${storedCount > 0 ? ` (${storedCount})` : ""}` : t(`category.${cat}`)}
          </button>
        ))}
      </div>

      {/* Pending uploads (shown on the "all" view so they don't disappear
          when the user is filtering by category) */}
      {activeCategory === "all" && (
        <PendingStrip
          pending={pending.filter((p) => p.stage !== "ready")}
          onRetry={retry}
          onDismiss={dismiss}
        />
      )}

      {/* Items grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClothingCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredItems.length === 0 && pending.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <p className="text-muted-foreground mb-3">
            {items.length === 0
              ? t("wardrobe.empty")
              : t("wardrobe.noneInCategory")}
          </p>
          {items.length === 0 && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => libraryInputRef.current?.click()}
            >
              <Plus className="h-4 w-4" />
              {t("wardrobe.addFirstItem")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredItems.map((item) => (
            <ClothingCard
              key={item.id}
              item={item}
              selectMode={selectMode}
              isSelected={selected.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Burgundy palette — keeps AI/Yav surfaces consistent across the app.
const BURGUNDY_BG = "bg-[#fdf2f4]";
const BURGUNDY_BORDER = "border-[#e8b4bc]";
const BURGUNDY_TEXT = "text-[#7c2d3a]";
const BURGUNDY_SUBTLE = "text-[#9b4050]/80";

function PendingStrip({
  pending,
  onRetry,
  onDismiss,
}: {
  pending: PendingItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (pending.length === 0) return null;
  const processing = pending.filter((p) => p.stage !== "error").length;
  return (
    <div className={cn("mb-4 rounded-xl px-4 py-3", BURGUNDY_BG, "border", BURGUNDY_BORDER)}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className={cn("h-4 w-4", BURGUNDY_TEXT)} />
        <span className={cn("text-sm font-medium", BURGUNDY_TEXT)}>
          {processing > 0
            ? `Yav is adding ${processing} item${processing === 1 ? "" : "s"} to your wardrobe`
            : "Some uploads need attention"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {pending.map((p) => (
          <PendingTile
            key={p.id}
            item={p}
            onRetry={() => onRetry(p.id)}
            onDismiss={() => onDismiss(p.id)}
          />
        ))}
      </div>
      <p className={cn("mt-2 text-[11px]", BURGUNDY_SUBTLE)}>
        You can close this page — they&apos;ll keep processing and appear in your wardrobe when ready.
      </p>
    </div>
  );
}

function PendingTile({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingItem;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isError = item.stage === "error";
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt=""
        className="h-full w-full object-cover opacity-70"
      />
      {isError ? (
        <button
          type="button"
          onClick={onRetry}
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-950/60 text-white"
          title={item.error ? `Tap to retry — ${item.error}` : "Tap to retry"}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="text-[10px] font-medium">Retry</span>
        </button>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        </div>
      )}
      {isError && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
          title="Remove from list"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
