"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2, Search, X } from "lucide-react";
import type { ClothingItem } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { cn } from "@/lib/utils";

interface SetPickerProps {
  open: boolean;
  onClose: () => void;
  /** Items already in the same set as the current item (excluded from picker). */
  excludeIds: Set<string>;
  /** Called with the chosen item when the user picks one. */
  onPick: (item: ClothingItem) => void | Promise<void>;
}

/**
 * Modal that lists every item in the user's wardrobe (minus the current item
 * and any already-linked set members) and lets them pick one to link.
 */
export function SetPicker({ open, onClose, excludeIds, onPick }: SetPickerProps) {
  const { t } = useLocale();
  const labels = useLabels();
  const [items, setItems] = useState<ClothingItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/items")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClothingItem[]) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const visible = items.filter((i) => !excludeIds.has(i.id));
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((i) => {
      const haystack = `${i.name ?? ""} ${i.brand ?? ""} ${i.subcategory ?? ""} ${i.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, excludeIds, query]);

  if (!open) return null;

  async function handlePick(item: ClothingItem) {
    setPicking(item.id);
    try {
      await onPick(item);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{t("set.pickerTitle")}</h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("set.pickerSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("set.pickerEmpty")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((item) => {
                const isPicking = picking === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={picking !== null}
                    onClick={() => handlePick(item)}
                    className={cn(
                      "group flex flex-col gap-1 rounded-lg p-1 text-left transition-colors hover:bg-muted",
                      isPicking && "opacity-60"
                    )}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                      <Image
                        src={item.thumbnail_url ?? item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="120px"
                      />
                      {isPicking && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <p className="truncate text-xs">{item.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {labels.CATEGORY[item.category]}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
