"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Outfit, ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, Trash2, Thermometer, Shirt } from "lucide-react";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

export default function FavoritesPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Occasion | "all" | "custom">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

        // Only show favorited outfits, resolve items
        const resolved = outfitData
          .filter((o) => o.is_favorite)
          .map((outfit) => ({
            ...outfit,
            items: outfit.item_ids
              .map((id) => items.find((item) => item.id === id))
              .filter(Boolean) as ClothingItem[],
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
    await fetch("/api/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("favorites.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("favorites.subtitle")}
          </p>
        </div>
        <Link href="/suggest">
          <Button size="sm" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            New
          </Button>
        </Link>
      </div>

      {/* Occasion filter tabs */}
      {!loading && outfits.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(
            [
              { key: "all", label: "All" },
              { key: "custom", label: "Custom" },
              ...Object.entries(OCCASION_LABELS).map(([key, label]) => ({ key, label })),
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
              className="overflow-hidden cursor-pointer"
              onClick={() => setExpandedId(expandedId === outfit.id ? null : outfit.id)}
            >
              <CardContent className="p-0">
                {expandedId === outfit.id ? (
                  /* ===== EXPANDED VIEW ===== */
                  <div>
                    {/* Large item images grid */}
                    <div className="grid grid-cols-2 gap-1 p-1">
                      {(outfit.items ?? []).map((item) => (
                        <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted/30">
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 250px"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-xs text-white truncate">{item.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Details */}
                    <div className="p-3 space-y-3">
                      <p className="font-medium text-sm">
                        {outfit.name || "Saved Outfit"}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {outfit.mood && (
                          <Badge variant="secondary" className="text-xs gap-0.5">
                            {MOOD_CONFIG[outfit.mood]?.emoji} {t(`mood.${outfit.mood}.label`)}
                          </Badge>
                        )}
                        {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                          <Badge variant="outline" className="text-xs gap-0.5">
                            <Thermometer className="h-3 w-3" />
                            {convertTemp(outfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"} {outfit.weather_condition || ""}
                          </Badge>
                        )}
                        {outfit.occasions.map((o) => (
                          <Badge key={o} variant="outline" className="text-xs">
                            {t(`occasion.${o}`)}
                          </Badge>
                        ))}
                        {outfit.source === "manual" && (
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        )}
                      </div>

                      {outfit.ai_reasoning && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {outfit.ai_reasoning}
                        </p>
                      )}

                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => wearFavoriteToday(outfit)}
                        >
                          <Shirt className="h-4 w-4" />
                          Wear Today
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive"
                          onClick={() => removeFavorite(outfit.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ===== COLLAPSED VIEW ===== */
                  <>
                    <div className="flex h-28 gap-0.5">
                      {(outfit.items ?? []).slice(0, 5).map((item) => (
                        <div key={item.id} className="relative flex-1 overflow-hidden bg-muted/30">
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            className="object-cover"
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
                    <div className="p-3">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm">
                          {outfit.name || "Saved Outfit"}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFavorite(outfit.id); }}
                          className="text-muted-foreground hover:text-destructive p-0.5 -mt-0.5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {outfit.mood && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            {MOOD_CONFIG[outfit.mood]?.emoji} {t(`mood.${outfit.mood}.label`)}
                          </Badge>
                        )}
                        {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <Thermometer className="h-2.5 w-2.5" />
                            {convertTemp(outfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"}
                          </Badge>
                        )}
                        {outfit.occasions.slice(0, 2).map((o) => (
                          <Badge key={o} variant="outline" className="text-[10px]">
                            {t(`occasion.${o}`)}
                          </Badge>
                        ))}
                        {outfit.source === "manual" && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
