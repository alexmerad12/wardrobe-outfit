"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Outfit, ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { MOOD_ICONS } from "@/lib/mood-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, Trash2, Thermometer, Shirt, CheckSquare, X, Check, ChevronDown } from "lucide-react";
import { orderOutfitItems } from "@/lib/outfit-order";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";
import { useLocale } from "@/lib/i18n/use-locale";
import { ShareOutfitButton } from "@/components/share-outfit-button";
import { cn } from "@/lib/utils";

export default function FavoritesPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Occasion | "all" | "custom">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const unit = useTemperatureUnit();
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    async function fetchFavorites() {
      try {
        const [outfitRes, itemRes] = await Promise.all([
          fetch("/api/outfits"),
          fetch("/api/items"),
        ]);

        const items = itemRes.ok ? ((await itemRes.json()) as ClothingItem[]) : [];
        setAllItems(items);

        const outfitData = outfitRes.ok ? ((await outfitRes.json()) as Outfit[]) : [];

        // Only show favorited outfits, resolve items, and apply the
        // canonical head-to-toe display order so favorites read the
        // same as Suggest results and today/recent on the home page.
        const resolved = outfitData
          .filter((o) => o.is_favorite)
          .map((outfit) => ({
            ...outfit,
            items: orderOutfitItems(
              outfit.item_ids
                .map((id) => items.find((item) => item.id === id))
                .filter(Boolean) as ClothingItem[]
            ),
          }));

        setOutfits(resolved);
      } catch (err) {
        console.error("Failed to fetch favorites:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchFavorites();
  }, []);

  async function wearFavoriteToday(outfit: Outfit) {
    // Pass outfit_id so the wear log links back to this favorite —
    // without it the profile's wear count can't match the log entry
    // to any outfit row.
    await fetch("/api/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outfit_id: outfit.id,
        item_ids: outfit.item_ids,
        name: outfit.name,
        reasoning: outfit.ai_reasoning,
        mood: outfit.mood,
        occasion: outfit.occasions[0] ?? null,
        weather_temp: outfit.weather_temp,
        weather_condition: outfit.weather_condition,
        is_favorite: true,
      }),
    });
    router.push("/");
  }

  async function removeFavorite(outfitId: string) {
    // Unfavorite (keeps the outfit but removes from favorites view)
    await fetch(`/api/outfits/${outfitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: false }),
    });
    setOutfits((prev) => prev.filter((o) => o.id !== outfitId));
  }

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

  async function handleBulkRemove() {
    if (selected.size === 0) return;
    setRemoving(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/outfits/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_favorite: false }),
          })
        )
      );
      setOutfits((prev) => prev.filter((o) => !selected.has(o.id)));
      exitSelectMode();
    } catch (err) {
      console.error("Failed to bulk-remove favorites:", err);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      {/* Sticky top bar. Select mode mirrors the wardrobe pattern — Cancel
          + count on the left, bulk Remove on the right. */}
      <div className="sticky top-0 z-30 -mx-4 -mt-6 mb-4 border-b bg-background px-4 pb-3 pt-6">
        {selectMode ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button size="icon" variant="ghost" onClick={exitSelectMode}>
                <X className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium truncate">
                {t("wardrobe.nSelected", { count: selected.size })}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={selected.size === 0 || removing}
                onClick={handleBulkRemove}
              >
                <Trash2 className="h-4 w-4" />
                {t("common.remove")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-3xl font-medium tracking-tight">{t("favorites.title")}</h1>
              <p className="truncate text-sm text-muted-foreground">{t("favorites.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Heart + count, sized like a button so it sits on the same
                  baseline as the Select action — same line-icon family as
                  the mood / weather icons elsewhere in the app. */}
              <div className="flex h-8 items-center gap-1 rounded-md px-2 text-foreground">
                <Heart className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                <span className="font-heading text-base">{outfits.length}</span>
              </div>
              {outfits.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setSelectMode(true);
                    setExpandedId(null);
                  }}
                >
                  <CheckSquare className="h-4 w-4" />
                  {t("wardrobe.select")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Occasion filter tabs */}
      {!loading && outfits.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(
            [
              { key: "all", label: t("category.all") },
              { key: "custom", label: t("favorites.custom") },
              ...(Object.keys(OCCASION_LABELS) as Occasion[]).map((key) => ({ key, label: t(`occasion.${key}`) })),
            ] as { key: string; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key as Occasion | "all" | "custom")}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                activeFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : outfits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <Heart className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-1">{t("favorites.none")}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {t("favorites.noneHint")}
          </p>
          <Link href="/suggest">
            <Button variant="outline" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              {t("favorites.getSuggestions")}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {outfits
            .filter((outfit) => {
              if (activeFilter === "all") return true;
              if (activeFilter === "custom") return outfit.source === "manual";
              return outfit.occasions.includes(activeFilter as Occasion);
            })
            .map((outfit) => (
            <Card
              key={outfit.id}
              className={cn(
                "overflow-hidden relative",
                selectMode && "cursor-pointer",
                selectMode && selected.has(outfit.id) && "ring-2 ring-primary"
              )}
              onClick={selectMode ? () => toggleSelect(outfit.id) : undefined}
            >
              {selectMode && (
                <div
                  className={cn(
                    "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors",
                    selected.has(outfit.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/80 bg-black/20"
                  )}
                >
                  {selected.has(outfit.id) && <Check className="h-4 w-4" />}
                </div>
              )}
              <CardContent className="p-0">
                {/* Header row — only the chevron expands / closes. */}
                <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <p className="font-heading text-base font-medium min-w-0 flex-1 truncate tracking-tight">
                    {outfit.name || t("favorites.saved")}
                  </p>
                  {!selectMode && (
                    expandedId === outfit.id ? (
                      <button
                        type="button"
                        aria-label={t("itemDetail.close")}
                        onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                        className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={t("common.expand")}
                        onClick={(e) => { e.stopPropagation(); setExpandedId(outfit.id); }}
                        className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    )
                  )}
                </div>

                {/* Image strip (collapsed) or grid (expanded) */}
                {expandedId === outfit.id ? (
                  <div className="grid grid-cols-2 gap-1 p-1">
                    {(outfit.items ?? []).map((item) =>
                      selectMode ? (
                        <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted/30">
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            className="object-contain p-2"
                            sizes="(max-width: 640px) 50vw, 250px"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-xs text-white truncate">{item.name}</p>
                          </div>
                        </div>
                      ) : (
                        <Link
                          key={item.id}
                          href={`/wardrobe/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="relative aspect-square overflow-hidden rounded-lg bg-muted/30"
                        >
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            className="object-contain p-2"
                            sizes="(max-width: 640px) 50vw, 250px"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-xs text-white truncate">{item.name}</p>
                          </div>
                        </Link>
                      )
                    )}
                  </div>
                ) : (
                  <div className="flex h-28 gap-0.5">
                    {(outfit.items ?? []).slice(0, 5).map((item) => (
                      <div key={item.id} className="relative flex-1 overflow-hidden bg-muted/30">
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-contain p-1"
                          sizes="120px"
                        />
                      </div>
                    ))}
                    {(outfit.items?.length ?? 0) === 0 && (
                      <div className="flex-1 bg-muted/20 flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">No items</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Badges + (if expanded) reasoning / tip / action buttons */}
                <div className="px-3 pt-2 pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {outfit.mood && (() => {
                      const MoodIcon = MOOD_ICONS[outfit.mood];
                      return (
                        <Badge variant="secondary" className={cn("gap-1", expandedId === outfit.id ? "text-xs" : "text-[10px]")}>
                          <MoodIcon className="h-3 w-3" />
                          {t(`mood.${outfit.mood}.label`)}
                        </Badge>
                      );
                    })()}
                    {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                      <Badge variant="outline" className={cn("gap-0.5", expandedId === outfit.id ? "text-xs" : "text-[10px]")}>
                        <Thermometer className={expandedId === outfit.id ? "h-3 w-3" : "h-2.5 w-2.5"} />
                        {convertTemp(outfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"}
                        {expandedId === outfit.id && outfit.weather_condition ? ` ${outfit.weather_condition}` : ""}
                      </Badge>
                    )}
                    {(expandedId === outfit.id ? outfit.occasions : outfit.occasions.slice(0, 2)).map((o) => (
                      <Badge key={o} variant="outline" className={expandedId === outfit.id ? "text-xs" : "text-[10px]"}>
                        {t(`occasion.${o}`)}
                      </Badge>
                    ))}
                    {outfit.source === "manual" && (
                      <Badge variant="outline" className={expandedId === outfit.id ? "text-xs" : "text-[10px]"}>Custom</Badge>
                    )}
                  </div>

                  {expandedId === outfit.id && (
                    <div className="space-y-3 mt-3">
                      {outfit.ai_reasoning && (
                        <p className="stylist-quote text-sm">
                          {outfit.ai_reasoning}
                        </p>
                      )}

                      {outfit.styling_tip && (
                        <div className="border-t border-b border-border py-2.5">
                          <p className="editorial-label mb-1">{t("suggest.stylistTip")}</p>
                          <p className="text-xs leading-relaxed">{outfit.styling_tip}</p>
                        </div>
                      )}

                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => wearFavoriteToday(outfit)}
                        >
                          <Shirt className="h-4 w-4" />
                          {t("home.wearToday")}
                        </Button>
                        <ShareOutfitButton
                          items={outfit.items ?? []}
                          title={outfit.name || t("favorites.saved")}
                          variant="outline"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive"
                          onClick={() => removeFavorite(outfit.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("common.remove")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
