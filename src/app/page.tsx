"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/weather-widget";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Shirt, Heart, Trash2, Thermometer, Plane, ChevronDown, X, ShoppingBag } from "lucide-react";
import type { ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { MOOD_ICONS } from "@/lib/mood-icons";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { orderOutfitItems } from "@/lib/outfit-order";
import { convertTemp } from "@/lib/temperature";
import { getLocalDateString } from "@/lib/local-date";
import { useLocale } from "@/lib/i18n/use-locale";
import { ShareOutfitButton } from "@/components/share-outfit-button";
import { cn } from "@/lib/utils";

interface TodayOutfit {
  outfit_id: string;
  item_ids: string[];
  name: string | null;
  reasoning: string | null;
  styling_tip: string | null;
  mood: string | null;
  occasion: string | null;
  weather_temp: number | null;
  weather_condition: string | null;
  is_favorite: boolean;
  date: string;
}

export default function HomePage() {
  const [todayOutfit, setTodayOutfit] = useState<TodayOutfit | null>(null);
  const [todayItems, setTodayItems] = useState<ClothingItem[]>([]);
  const [recentOutfits, setRecentOutfits] = useState<(TodayOutfit & { items: ClothingItem[] })[]>([]);
  const [expandedRecent, setExpandedRecent] = useState<string | null>(null);
  const [todayExpanded, setTodayExpanded] = useState(false);
  const unit = useTemperatureUnit();
  const { t } = useLocale();

  useEffect(() => {
    async function load() {
      try {
        const [todayRes, itemsRes] = await Promise.all([
          fetch(`/api/today?date=${getLocalDateString()}`),
          fetch("/api/items"),
        ]);

        const allItems: ClothingItem[] = itemsRes.ok ? await itemsRes.json() : [];

        if (todayRes.ok) {
          const { today, recent } = await todayRes.json();

          if (today) {
            setTodayOutfit(today);
            setTodayItems(
              orderOutfitItems(
                today.item_ids
                  .map((id: string) => allItems.find((i) => i.id === id))
                  .filter(Boolean) as ClothingItem[]
              )
            );
          }

          if (recent?.length > 0) {
            setRecentOutfits(
              recent.map((r: TodayOutfit) => ({
                ...r,
                items: orderOutfitItems(
                  r.item_ids
                    .map((id) => allItems.find((i) => i.id === id))
                    .filter(Boolean) as ClothingItem[]
                ),
              }))
            );
          }
        }
      } catch (err) {
        console.error("Failed to load home data:", err);
      }
    }
    load();
  }, []);

  async function toggleTodayFavorite() {
    if (!todayOutfit) return;
    const newFav = !todayOutfit.is_favorite;
    // The favorites view reads from the `outfits` table, not
    // `today_outfit`, so the toggle must mirror state into both.
    let outfitId = todayOutfit.outfit_id;

    if (newFav) {
      const patchRes = await fetch(`/api/outfits/${outfitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: true }),
      });
      if (patchRes.status === 404) {
        // No outfits row exists yet (today's look came from a manual
        // rotation rather than /suggest → Wear today). Create one and
        // re-link today_outfit to its new id.
        const createRes = await fetch("/api/outfits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: todayOutfit.name,
            item_ids: todayOutfit.item_ids,
            occasions: todayOutfit.occasion ? [todayOutfit.occasion] : [],
            seasons: [],
            rating: null,
            is_favorite: true,
            mood: todayOutfit.mood,
            weather_temp: todayOutfit.weather_temp,
            weather_condition: todayOutfit.weather_condition,
            ai_reasoning: todayOutfit.reasoning,
            styling_tip: todayOutfit.styling_tip,
            source: "ai",
          }),
        });
        if (createRes.ok) {
          const created = (await createRes.json()) as { id: string };
          outfitId = created.id;
        }
      }
    } else {
      await fetch(`/api/outfits/${outfitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: false }),
      });
    }

    await fetch("/api/today", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newFav, outfit_id: outfitId }),
    });
    setTodayOutfit({ ...todayOutfit, is_favorite: newFav, outfit_id: outfitId });
  }

  async function wearRecentToday(outfit: TodayOutfit & { items: ClothingItem[] }) {
    await fetch("/api/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Link the new wear log entry to the same outfit row this
        // recent entry came from — otherwise the profile wear count
        // can't match the log back to any outfit.
        outfit_id: outfit.outfit_id,
        item_ids: outfit.item_ids,
        name: outfit.name,
        reasoning: outfit.reasoning,
        mood: outfit.mood,
        occasion: outfit.occasion,
        weather_temp: outfit.weather_temp,
        weather_condition: outfit.weather_condition,
        is_favorite: outfit.is_favorite ?? false,
        date: getLocalDateString(),
      }),
    });
    setTodayOutfit({
      ...outfit,
      date: getLocalDateString(),
    });
    setTodayItems(outfit.items);
    setExpandedRecent(null);
  }

  async function favoriteRecent(outfit: TodayOutfit & { items: ClothingItem[] }) {
    await fetch("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "default",
        name: outfit.name,
        item_ids: outfit.item_ids,
        occasions: outfit.occasion ? [outfit.occasion] : [],
        seasons: [],
        rating: null,
        is_favorite: true,
        mood: outfit.mood,
        weather_temp: outfit.weather_temp,
        weather_condition: outfit.weather_condition,
        ai_reasoning: outfit.reasoning,
        source: "ai",
      }),
    });
    // Visual feedback - briefly update the outfit
    setExpandedRecent(null);
  }

  async function clearTodayOutfit() {
    if (!confirm(t("home.confirmRemoveTodaysOutfit"))) return;
    await fetch("/api/today", { method: "DELETE" });
    setTodayOutfit(null);
    setTodayItems([]);
  }

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.goodMorning");
    if (hour < 18) return t("home.goodAfternoon");
    return t("home.goodEvening");
  })();

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-medium tracking-tight">
          {greeting}
        </h1>
        <p className="text-muted-foreground mt-0.5">
          {todayOutfit
            ? t("home.allSet")
            : t("home.letsFindOutfit")}
        </p>
      </div>

      {/* Weather */}
      <div className="mb-6">
        <WeatherWidget />
      </div>

      {/* Today's Outfit */}
      {todayOutfit && todayItems.length > 0 && (
        <div className="mb-6">
          <h2 className="font-heading text-xl font-medium tracking-tight mb-3">{t("home.todaysOutfit")}</h2>
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
              {/* Outfit name + expand/collapse control. Only the chevron
                  expands; tapping the card body does nothing. */}
              <div className="flex items-center justify-between">
                <p className="font-heading text-lg font-medium tracking-tight">{todayOutfit.name || t("home.todaysLook")}</p>
                {todayExpanded ? (
                  <button
                    type="button"
                    aria-label={t("itemDetail.close")}
                    onClick={() => setTodayExpanded(false)}
                    className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t("common.expand")}
                    onClick={() => setTodayExpanded(true)}
                    className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Item photos. Collapsed: horizontal scroll (compact).
                  Expanded: 2-column grid with bigger images, matching
                  the recent outfits grid for consistency. Each tile is
                  a Link to the item's detail page; stopPropagation so
                  tapping doesn't also toggle the card. */}
              {todayExpanded ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {todayItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/wardrobe/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="relative aspect-square overflow-hidden rounded-lg bg-muted/30"
                    >
                      <Image src={item.image_url} alt={item.name} fill className="object-contain p-2" sizes="(max-width: 640px) 45vw, 200px" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <p className="truncate text-[10px] text-white">{item.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex h-28 gap-0.5 -mx-4 overflow-hidden">
                  {todayItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="relative flex-1 overflow-hidden bg-muted/30">
                      <Image src={item.image_url} alt={item.name} fill className="object-contain p-1" sizes="120px" />
                    </div>
                  ))}
                </div>
              )}

              {/* Mood / Occasion / Weather row (below items) */}
              <div className="flex flex-wrap gap-2">
                {!todayOutfit.mood && !todayOutfit.occasion && (todayOutfit.weather_temp === null || todayOutfit.weather_temp === undefined) && (
                  <p className="text-xs text-muted-foreground italic">{t("home.tapWearTodayHint")}</p>
                )}
                {todayOutfit.mood && MOOD_CONFIG[todayOutfit.mood as Mood] && (() => {
                  const MoodIcon = MOOD_ICONS[todayOutfit.mood as Mood];
                  return (
                    <div className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                      <MoodIcon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium leading-tight">{t(`mood.${todayOutfit.mood}.label`)}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{t("home.moodLabel")}</p>
                      </div>
                    </div>
                  );
                })()}
                {todayOutfit.occasion && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium leading-tight">{t(`occasion.${todayOutfit.occasion}`)}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{t("home.occasionLabel")}</p>
                    </div>
                  </div>
                )}
                {todayOutfit.weather_temp !== null && todayOutfit.weather_temp !== undefined && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                    <Thermometer className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium leading-tight">{convertTemp(todayOutfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{todayOutfit.weather_condition || t("home.weatherLabel")}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded content: description + stylist tip + action buttons */}
              {todayExpanded && (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  {todayOutfit.reasoning && (
                    <p className="stylist-quote text-xs">
                      {todayOutfit.reasoning}
                    </p>
                  )}
                  {todayOutfit.styling_tip && (
                    <div className="border-t border-b border-border py-2.5">
                      <p className="editorial-label mb-1">{t("suggest.stylistTip")}</p>
                      <p className="text-xs leading-relaxed">{todayOutfit.styling_tip}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <ShareOutfitButton
                      items={todayItems}
                      title={todayOutfit.name || t("share.todaysLook")}
                      variant="outline"
                      className="flex-1"
                    />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={toggleTodayFavorite}>
                      <Heart className={cn("h-4 w-4", todayOutfit.is_favorite && "fill-red-500 text-red-500")} />
                      {t("home.favorite")}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={clearTodayOutfit}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}


      {/* Quick Actions */}
      <div className="grid gap-3 mb-8">
        <Link href="/suggest">
          <Button className="w-full h-14 text-base gap-2" size="lg">
            <Sparkles className="h-5 w-5" />
            {todayOutfit ? t("home.getMoreSuggestions") : t("home.whatShouldIWear")}
          </Button>
        </Link>

        {/* Shopping helper — analyze an item before buying. Secondary CTA
            so it doesn't compete with the main Suggest button. */}
        <Link href="/try-on">
          <Button
            variant="outline"
            className="w-full h-12 text-sm gap-2"
          >
            <ShoppingBag className="h-4 w-4" />
            {t("home.tryBeforeBuying")}
          </Button>
        </Link>

        <div className="grid grid-cols-3 gap-3">
          <Link href="/wardrobe/add">
            <Button variant="outline" className="w-full h-12 gap-1 text-xs" size="lg">
              <Plus className="h-4 w-4" />
              {t("home.addItem")}
            </Button>
          </Link>
          <Link href="/wardrobe">
            <Button variant="outline" className="w-full h-12 gap-1 text-xs" size="lg">
              <Shirt className="h-4 w-4" />
              {t("home.myWardrobe")}
            </Button>
          </Link>
          <Link href="/packing">
            <Button variant="outline" className="w-full h-12 gap-1 text-xs" size="lg">
              <Plane className="h-4 w-4" />
              {t("home.pack")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent Outfits */}
      <div>
        <h2 className="font-heading text-xl font-medium tracking-tight mb-3">{t("home.recentOutfits")}</h2>
        {recentOutfits.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t("home.outfitHistoryEmpty")}
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              {t("home.outfitHistoryHint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {recentOutfits.slice(0, 10).map((outfit) => {
              const isExpanded = expandedRecent === outfit.outfit_id;
              const dateLabel = new Date(outfit.date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <Card
                  key={outfit.outfit_id}
                  className="overflow-hidden"
                >
                  <CardContent className="p-0">
                    {/* Header row — only the chevron expands / closes. */}
                    <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                      <p className="font-heading text-base font-medium min-w-0 flex-1 truncate tracking-tight">
                        {outfit.name || t("favorites.saved")}
                      </p>
                      <p className="text-xs text-muted-foreground shrink-0">{dateLabel}</p>
                      {isExpanded ? (
                        <button
                          type="button"
                          aria-label={t("itemDetail.close")}
                          onClick={() => setExpandedRecent(null)}
                          className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={t("common.expand")}
                          onClick={() => setExpandedRecent(outfit.outfit_id)}
                          className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Image strip (collapsed) or grid (expanded) */}
                    {isExpanded ? (
                      <div className="grid grid-cols-2 gap-1 p-1">
                        {outfit.items.map((item) => (
                          <Link
                            key={item.id}
                            href={`/wardrobe/${item.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="relative aspect-square overflow-hidden rounded-lg bg-muted/30"
                          >
                            <Image src={item.image_url} alt={item.name} fill className="object-contain p-2" sizes="(max-width: 640px) 50vw, 250px" />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="text-xs text-white truncate">{item.name}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-28 gap-0.5">
                        {outfit.items.slice(0, 5).map((item) => (
                          <div key={item.id} className="relative flex-1 overflow-hidden bg-muted/30">
                            <Image src={item.image_url} alt={item.name} fill className="object-contain p-1" sizes="120px" />
                          </div>
                        ))}
                        {outfit.items.length === 0 && (
                          <div className="flex-1 bg-muted/20 flex items-center justify-center">
                            <p className="text-xs text-muted-foreground">No items</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Badges row — always visible, sized by state */}
                    <div className="px-3 pt-2 pb-3">
                      <div className={cn(
                        "flex flex-wrap items-center gap-1.5",
                        isExpanded ? "" : ""
                      )}>
                        {outfit.mood && MOOD_CONFIG[outfit.mood as Mood] && (() => {
                          const MoodIcon = MOOD_ICONS[outfit.mood as Mood];
                          return (
                            <Badge variant="secondary" className={cn("gap-1", isExpanded ? "text-xs" : "text-[10px]")}>
                              <MoodIcon className="h-3 w-3" />
                              {t(`mood.${outfit.mood}.label`)}
                            </Badge>
                          );
                        })()}
                        {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                          <Badge variant="outline" className={cn("gap-0.5", isExpanded ? "text-xs" : "text-[10px]")}>
                            <Thermometer className={isExpanded ? "h-3 w-3" : "h-2.5 w-2.5"} />
                            {convertTemp(outfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"}
                            {isExpanded && outfit.weather_condition ? ` ${outfit.weather_condition}` : ""}
                          </Badge>
                        )}
                        {outfit.occasion && (
                          <Badge variant="outline" className={isExpanded ? "text-xs" : "text-[10px]"}>
                            {t(`occasion.${outfit.occasion}`)}
                          </Badge>
                        )}
                      </div>

                      {/* Expanded-only details */}
                      {isExpanded && (
                        <div className="space-y-3 mt-3">
                          {outfit.reasoning && (
                            <p className="stylist-quote text-sm">
                              {outfit.reasoning}
                            </p>
                          )}

                          {outfit.styling_tip && (
                            <div className="border-t border-b border-border py-2.5">
                              <p className="editorial-label mb-1">{t("suggest.stylistTip")}</p>
                              <p className="text-xs leading-relaxed">{outfit.styling_tip}</p>
                            </div>
                          )}

                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => favoriteRecent(outfit)}>
                              <Heart className="h-4 w-4" />
                              {t("home.favorite")}
                            </Button>
                            <Button size="sm" className="flex-1 gap-1.5" onClick={() => wearRecentToday(outfit)}>
                              <Shirt className="h-4 w-4" />
                              {t("home.wearToday")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
