"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/weather-widget";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Shirt, Heart, Trash2, Thermometer, Plane, ChevronDown } from "lucide-react";
import type { ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { MOOD_ICONS } from "@/lib/mood-icons";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";
import { useLocale } from "@/lib/i18n/use-locale";
import { ShareOutfitButton } from "@/components/share-outfit-button";
import { cn } from "@/lib/utils";

interface TodayOutfit {
  outfit_id: string;
  item_ids: string[];
  name: string | null;
  reasoning: string | null;
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
  const [forgottenItems, setForgottenItems] = useState<ClothingItem[]>([]);
  const unit = useTemperatureUnit();
  const { t } = useLocale();

  useEffect(() => {
    async function load() {
      try {
        const [todayRes, itemsRes] = await Promise.all([
          fetch("/api/today"),
          fetch("/api/items"),
        ]);

        const allItems: ClothingItem[] = itemsRes.ok ? await itemsRes.json() : [];

        // Find forgotten items (not worn in 3+ weeks, or never worn and added 1+ week ago)
        const now = Date.now();
        const threeWeeks = 21 * 24 * 60 * 60 * 1000;
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const forgotten = allItems.filter((item) => {
          if (item.last_worn_date) {
            return now - new Date(item.last_worn_date).getTime() > threeWeeks;
          }
          // Never worn - only nudge if added more than a week ago
          return now - new Date(item.created_at).getTime() > oneWeek;
        });
        // Shuffle and take up to 3
        const shuffled = forgotten.sort(() => Math.random() - 0.5);
        setForgottenItems(shuffled.slice(0, 3));

        if (todayRes.ok) {
          const { today, recent } = await todayRes.json();

          if (today) {
            setTodayOutfit(today);
            setTodayItems(
              today.item_ids
                .map((id: string) => allItems.find((i) => i.id === id))
                .filter(Boolean) as ClothingItem[]
            );
          }

          if (recent?.length > 0) {
            setRecentOutfits(
              recent.map((r: TodayOutfit) => ({
                ...r,
                items: r.item_ids
                  .map((id) => allItems.find((i) => i.id === id))
                  .filter(Boolean) as ClothingItem[],
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
    await fetch("/api/today", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newFav }),
    });
    setTodayOutfit({ ...todayOutfit, is_favorite: newFav });
  }

  async function wearRecentToday(outfit: TodayOutfit & { items: ClothingItem[] }) {
    await fetch("/api/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: outfit.item_ids,
        name: outfit.name,
        reasoning: outfit.reasoning,
        mood: outfit.mood,
        occasion: outfit.occasion,
        weather_temp: outfit.weather_temp,
        weather_condition: outfit.weather_condition,
        is_favorite: outfit.is_favorite ?? false,
      }),
    });
    setTodayOutfit({
      ...outfit,
      date: new Date().toISOString().split("T")[0],
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
          <h2 className="text-lg font-semibold mb-3">{t("home.todaysOutfit")}</h2>
          <Card
            className="overflow-hidden cursor-pointer"
            onClick={() => setTodayExpanded((v) => !v)}
          >
            <CardContent className="p-4 space-y-4">
              {/* Outfit name + expand chevron. Action buttons only appear
                  once the user taps in — keeps the collapsed card compact. */}
              <div className="flex items-center justify-between">
                <p className="font-semibold">{todayOutfit.name || t("home.todaysLook")}</p>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    todayExpanded && "rotate-180"
                  )}
                />
              </div>

              {/* Item photos - horizontal scroll, names overlaid on photo
                  to match the style of the recent outfits grid. */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {todayItems.map((item) => (
                  <div key={item.id} className="relative aspect-square w-28 flex-shrink-0 overflow-hidden rounded-lg bg-muted/30">
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="112px" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <p className="truncate text-[10px] text-white">{item.name}</p>
                    </div>
                  </div>
                ))}
              </div>

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

              {/* Expanded content: description + action buttons */}
              {todayExpanded && (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  {todayOutfit.reasoning && (
                    <p className="text-xs text-muted-foreground leading-relaxed italic">
                      &ldquo;{todayOutfit.reasoning}&rdquo;
                    </p>
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
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={clearTodayOutfit}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Forgotten Items */}
      {forgottenItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{t("home.forgottenInWardrobe")}</h2>
          <p className="text-xs text-muted-foreground mb-3">{t("home.forgottenHint")}</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {forgottenItems.map((item) => (
              <Link key={item.id} href={`/wardrobe/${item.id}`} className="flex-shrink-0 w-24">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted/30 mb-1">
                  <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="96px" />
                </div>
                <p className="text-[11px] font-medium truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.last_worn_date
                    ? t("home.lastWorn", { days: Math.round((Date.now() - new Date(item.last_worn_date).getTime()) / (1000 * 60 * 60 * 24)) })
                    : t("home.neverWorn")}
                </p>
              </Link>
            ))}
          </div>
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
        <h2 className="text-lg font-semibold mb-3">{t("home.recentOutfits")}</h2>
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
            {recentOutfits.slice(0, 7).map((outfit) => {
              const isExpanded = expandedRecent === outfit.date;
              return (
                <Card
                  key={outfit.date}
                  className="overflow-hidden cursor-pointer"
                  onClick={() => setExpandedRecent(isExpanded ? null : outfit.date)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(outfit.date + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      {outfit.name && (
                        <p className="text-xs font-medium">{outfit.name}</p>
                      )}
                    </div>

                    {isExpanded ? (
                      <>
                        {/* Bigger photos */}
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          {outfit.items.map((item) => (
                            <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted/30">
                              <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="120px" />
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                                <p className="text-[10px] text-white truncate">{item.name}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Context badges */}
                        {(outfit.mood || outfit.occasion || outfit.weather_temp !== null) && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {outfit.mood && MOOD_CONFIG[outfit.mood as Mood] && (() => {
                              const MoodIcon = MOOD_ICONS[outfit.mood as Mood];
                              return (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <MoodIcon className="h-3 w-3" />
                                  {t(`mood.${outfit.mood}.label`)}
                                </Badge>
                              );
                            })()}
                            {outfit.occasion && (
                              <Badge variant="outline" className="text-[10px]">
                                {t(`occasion.${outfit.occasion}`)}
                              </Badge>
                            )}
                            {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                              <Badge variant="outline" className="text-[10px] gap-0.5">
                                <Thermometer className="h-2.5 w-2.5" />
                                {convertTemp(outfit.weather_temp, unit)}°{unit === "fahrenheit" ? "F" : "C"}
                              </Badge>
                            )}
                          </div>
                        )}

                        {outfit.reasoning && (
                          <p className="text-xs text-muted-foreground italic mb-3">
                            &ldquo;{outfit.reasoning}&rdquo;
                          </p>
                        )}

                        {/* Actions */}
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
                      </>
                    ) : (
                      <div className="flex gap-1.5">
                        {outfit.items.slice(0, 5).map((item) => (
                          <div key={item.id} className="relative h-14 w-14 flex-shrink-0 rounded-md overflow-hidden bg-muted/30">
                            <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />
                          </div>
                        ))}
                      </div>
                    )}
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
