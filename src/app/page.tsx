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
import { BrandedName } from "@/components/brand/branded-name";
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
  // wardrobeCount === null means we haven't loaded /api/items yet, so we
  // can't decide between the normal home and the first-time empty
  // state. Showing nothing during the load avoids a flash of the
  // "Add your first piece" CTA for users who already have a wardrobe.
  const [wardrobeCount, setWardrobeCount] = useState<number | null>(null);
  // Distinct from "wardrobe is empty": a failed /api/items fetch used to
  // set count 0 and show an established user the first-run "add your
  // first piece" state on flaky cellular (audit P1).
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recentOutfits, setRecentOutfits] = useState<(TodayOutfit & { items: ClothingItem[] })[]>([]);
  const [expandedRecent, setExpandedRecent] = useState<string | null>(null);
  const [todayExpanded, setTodayExpanded] = useState(false);
  const [favTogglePending, setFavTogglePending] = useState(false);
  const [recentActionPending, setRecentActionPending] = useState(false);
  const [favToast, setFavToast] = useState<"saved" | "removed" | null>(null);
  const unit = useTemperatureUnit();
  const { t, locale } = useLocale();

  useEffect(() => {
    async function load() {
      try {
        const [todayRes, itemsRes] = await Promise.all([
          fetch(`/api/today?date=${getLocalDateString()}`),
          fetch("/api/items"),
        ]);

        if (!itemsRes.ok) {
          setLoadFailed(true);
          return;
        }
        const allItems: ClothingItem[] = await itemsRes.json();
        setWardrobeCount(allItems.length);

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
        setLoadFailed(true);
      }
    }
    load();
  }, [reloadKey]);

  async function toggleTodayFavorite() {
    if (!todayOutfit) return;
    if (favTogglePending) return; // dedupe rapid double-taps
    setFavTogglePending(true);
    // try/finally — a thrown fetch (network drop) used to skip the
    // pending reset and permanently brick the heart until reload
    // (audit P2).
    try {
    const newFav = !todayOutfit.is_favorite;
    // The favorites view reads from the `outfits` table, not
    // `today_outfit`, so the toggle must mirror state into both.
    let outfitId = todayOutfit.outfit_id;
    let mirrorOk = true;

    if (newFav) {
      // Try to PATCH the existing outfit row. ANY non-success (404 if
      // the row was deleted, 500 if outfit_id isn't a valid UUID, RLS
      // hiding the row, etc.) means the row doesn't exist for this
      // user — fall back to creating one.
      let patchOk = false;
      if (outfitId) {
        const patchRes = await fetch(`/api/outfits/${outfitId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: true }),
        });
        patchOk = patchRes.ok;
      }
      if (!patchOk) {
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
        } else {
          mirrorOk = false;
          console.error(
            "[favorite] failed to create outfit row:",
            createRes.status,
            await createRes.text()
          );
        }
      }
    } else {
      const unfavRes = await fetch(`/api/outfits/${outfitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: false }),
      });
      if (!unfavRes.ok && unfavRes.status !== 404) {
        // 404 just means the row's already gone — that's fine for unfavorite.
        mirrorOk = false;
      }
    }

    // Mirror into today_outfit so the heart icon stays consistent if
    // the page is reloaded.
    await fetch("/api/today", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newFav, outfit_id: outfitId }),
    });
    if (mirrorOk) {
      setTodayOutfit({ ...todayOutfit, is_favorite: newFav, outfit_id: outfitId });
      // In-place confirmation so the user sees what just happened
      // (heart-only feedback was easy to miss → users would re-tap
      // and accidentally toggle back to unfavorited).
      setFavToast(newFav ? "saved" : "removed");
      setTimeout(() => setFavToast(null), 1800);
    } else {
      alert(t("home.favoriteSaveFailed"));
    }
    } catch (err) {
      console.error("[favorite] toggle failed:", err);
      alert(t("home.favoriteSaveFailed"));
    } finally {
      setFavTogglePending(false);
    }
  }

  async function wearRecentToday(outfit: TodayOutfit & { items: ClothingItem[] }) {
    if (recentActionPending) return;
    setRecentActionPending(true);
    try {
      const res = await fetch("/api/today", {
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
      // Updating local state on failure showed an outfit the server
      // never recorded — gone on next reload (audit P2).
      if (!res.ok) throw new Error(`/api/today ${res.status}`);
      setTodayOutfit({
        ...outfit,
        date: getLocalDateString(),
      });
      setTodayItems(outfit.items);
      setExpandedRecent(null);
    } catch (err) {
      console.error("[wear-recent] failed:", err);
      alert(t("suggest.wearFailed"));
    } finally {
      setRecentActionPending(false);
    }
  }

  async function favoriteRecent(outfit: TodayOutfit & { items: ClothingItem[] }) {
    if (recentActionPending) return;
    setRecentActionPending(true);
    try {
      const res = await fetch("/api/outfits", {
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
      if (!res.ok) throw new Error(`/api/outfits ${res.status}`);
      setFavToast("saved");
      setTimeout(() => setFavToast(null), 1800);
      setExpandedRecent(null);
    } catch (err) {
      console.error("[favorite-recent] failed:", err);
      alert(t("home.favoriteSaveFailed"));
    } finally {
      setRecentActionPending(false);
    }
  }

  async function clearTodayOutfit() {
    if (!confirm(t("home.confirmRemoveTodaysOutfit"))) return;
    try {
      const res = await fetch("/api/today", { method: "DELETE" });
      // Optimistically clearing on failure made the outfit "reappear"
      // on the next reload (audit P3).
      if (!res.ok) throw new Error(`/api/today ${res.status}`);
      setTodayOutfit(null);
      setTodayItems([]);
    } catch (err) {
      console.error("[clear-today] failed:", err);
      alert(t("common.saveFailed"));
    }
  }

  // Greeting template carries the `{brand}` placeholder so BrandedName
  // can render "Linette" as Parisienne script — feels like her
  // handwritten signature on every visit rather than a typed mention.
  const greetingTemplate = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.goodMorning");
    if (hour < 18) return t("home.goodAfternoon");
    return t("home.goodEvening");
  })();

  // Fetch failure is NOT an empty wardrobe — show an honest error with
  // a retry instead of the first-run CTA or an eternal skeleton.
  if (loadFailed) {
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center mt-12">
          <p className="text-sm text-muted-foreground mb-4">
            {t("common.loadFailed")}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setLoadFailed(false);
              setWardrobeCount(null);
              setReloadKey((k) => k + 1);
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  // Hold the render until we know whether the wardrobe is empty.
  // Without this gate, the populated home flashes for first-time users
  // before the empty-state CTA mounts (and vice-versa for established
  // users we'd flash the CTA at). A neutral skeleton avoids both.
  if (wardrobeCount === null) {
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="mb-8 space-y-3">
          <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // First-time experience: wardrobe is empty. "Je mets quoi ?" with no
  // items is nonsensical, so swap the whole greeting + outfit area for
  // a single welcoming CTA pointing at /wardrobe/add. Once the user
  // adds their first piece, this branch falls through automatically.
  if (wardrobeCount === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-medium tracking-tight">
            <BrandedName template={t("home.welcomeToBrand")} scriptClassName="text-4xl leading-none" />
          </h1>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            {t("home.emptyWardrobeSub")}
          </p>
        </div>

        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center mb-4">
          <Shirt className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed mb-5">
            {t("home.emptyWardrobeHint")}
          </p>
          <Link href="/wardrobe/add">
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("home.uploadFirstPiece")}
            </Button>
          </Link>
          <div className="mt-3">
            <Link href="/wardrobe/bulk" className="text-xs text-foreground/80 underline underline-offset-2">
              {t("home.uploadMany")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-medium tracking-tight">
          <BrandedName template={greetingTemplate} scriptClassName="text-4xl leading-none" />
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
                      className="relative aspect-square overflow-hidden rounded-lg bg-card"
                    >
                      <Image src={item.image_url} alt={item.name} fill className="object-contain p-2" sizes="(max-width: 640px) 45vw, 200px" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <p className="truncate text-[10px] text-white">{item.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : todayItems.length > 5 ? (
                // 6+ items — horizontal scroll so users can see every
                // piece without expanding the card. Each item gets a
                // fixed width so dragging feels predictable.
                <div className="flex h-28 gap-0.5 -mx-4 overflow-x-auto overflow-y-hidden scrollbar-hide">
                  {todayItems.map((item) => (
                    <div key={item.id} className="relative h-28 w-24 shrink-0 overflow-hidden bg-card">
                      <Image src={item.image_url} alt={item.name} fill className="object-contain p-1" sizes="96px" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-28 gap-0.5 -mx-4 overflow-hidden">
                  {todayItems.map((item) => (
                    <div key={item.id} className="relative flex-1 overflow-hidden bg-card">
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
                      weatherTemp={todayOutfit.weather_temp}
                      weatherCondition={todayOutfit.weather_condition}
                      occasion={todayOutfit.occasion ? t(`occasion.${todayOutfit.occasion}`) : null}
                      date={todayOutfit.date}
                      temperatureUnit={unit}
                      variant="outline"
                      className="flex-1"
                    />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={toggleTodayFavorite}>
                      <Heart className={cn("h-4 w-4", todayOutfit.is_favorite && "fill-foreground text-foreground")} />
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

        {/* Situational tools — shopping (Try-on) and travel (Pack).
            Both are feature-discovery surfaces people forget exist
            between uses, so they get a title + caption treatment
            (instead of single-word buttons) to communicate what they
            actually do. Two-line layout also visually balances the
            short "Pack" word against the longer Try-on caption. */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/try-on">
            <Button
              variant="outline"
              className="w-full h-auto flex-col items-center gap-0.5 py-2.5"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBag className="h-4 w-4" />
                {t("home.tryBeforeBuying")}
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {t("home.tryBeforeBuyingCaption")}
              </span>
            </Button>
          </Link>
          <Link href="/packing">
            <Button
              variant="outline"
              className="w-full h-auto flex-col items-center gap-0.5 py-2.5"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Plane className="h-4 w-4" />
                {t("home.pack")}
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {t("home.packCaption")}
              </span>
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
              const dateLabel = new Date(outfit.date + "T12:00:00").toLocaleDateString(
                locale === "fr" ? "fr-CA" : "en-US",
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }
              );
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
                            className="relative aspect-square overflow-hidden rounded-lg bg-card"
                          >
                            <Image src={item.image_url} alt={item.name} fill className="object-contain p-2" sizes="(max-width: 640px) 50vw, 250px" />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="text-xs text-white truncate">{item.name}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : outfit.items.length > 5 ? (
                      // 6+ items — horizontal scroll for the collapsed view.
                      <div className="flex h-28 gap-0.5 overflow-x-auto overflow-y-hidden scrollbar-hide">
                        {outfit.items.map((item) => (
                          <div key={item.id} className="relative h-28 w-24 shrink-0 overflow-hidden bg-card">
                            <Image src={item.image_url} alt={item.name} fill className="object-contain p-1" sizes="96px" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-28 gap-0.5">
                        {outfit.items.map((item) => (
                          <div key={item.id} className="relative flex-1 overflow-hidden bg-card">
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

      {/* Inline favorite confirmation — heart-only feedback was easy
          to miss, leading users to re-tap and accidentally toggle off. */}
      {favToast && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200">
          {favToast === "saved" ? t("home.favoriteSaved") : t("home.favoriteRemoved")}
        </div>
      )}
    </div>
  );
}
