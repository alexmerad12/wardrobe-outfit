"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClothingItem, Category } from "@/lib/types";
import { ClothingCard, ClothingCardSkeleton } from "@/components/clothing-card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, X, CheckSquare, Combine, Archive } from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch("/api/items");
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch (err) {
        console.error("Failed to fetch items:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

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
              <Link href="/wardrobe/add">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </Link>
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

      {/* Items grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClothingCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <p className="text-muted-foreground mb-3">
            {items.length === 0
              ? t("wardrobe.empty")
              : t("wardrobe.noneInCategory")}
          </p>
          {items.length === 0 && (
            <Link href="/wardrobe/add">
              <Button variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("wardrobe.addFirstItem")}
              </Button>
            </Link>
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
