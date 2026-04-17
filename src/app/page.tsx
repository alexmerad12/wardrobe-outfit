"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/weather-widget";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Shirt, Heart, Trash2, ChevronDown, ChevronUp, Thermometer } from "lucide-react";
import type { ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
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
  const [todayExpanded, setTodayExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [todayRes, itemsRes] = await Promise.all([
          fetch("/api/today"),
          fetch("/api/items"),
        ]);

        const allItems: ClothingItem[] = itemsRes.ok ? await itemsRes.json() : [];

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

  async function clearTodayOutfit() {
    if (!confirm("Remove today's outfit?")) return;
    await fetch("/api/today", { method: "DELETE" });
    setTodayOutfit(null);
    setTodayItems([]);
  }

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning!";
    if (hour < 18) return "Good afternoon!";
    return "Good evening!";
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
            ? "You're all set for today."
            : "Let's find your perfect outfit today."}
        </p>
      </div>

      {/* Weather */}
      <div className="mb-6">
        <WeatherWidget />
      </div>

      {/* Today's Outfit */}
      {todayOutfit && todayItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Today&apos;s Outfit</h2>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={toggleTodayFavorite}>
                <Heart className={cn("h-4 w-4", todayOutfit.is_favorite && "fill-red-500 text-red-500")} />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={clearTodayOutfit}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card
            className="overflow-hidden cursor-pointer"
            onClick={() => setTodayExpanded(!todayExpanded)}
          >
            <CardContent className="p-0">
              {/* Image grid - always visible */}
              <div className={cn(
                "grid gap-0.5",
                todayItems.length <= 2 ? "grid-cols-2" : todayItems.length <= 4 ? "grid-cols-2" : "grid-cols-3"
              )}>
                {todayItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "relative overflow-hidden bg-muted/30",
                      todayExpanded ? "aspect-square" : "h-24"
                    )}
                  >
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="160px" />
                    {todayExpanded && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <p className="text-[11px] text-white truncate">{item.name}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Info section */}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{todayOutfit.name || "Today's Look"}</p>
                  {todayExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Context badges - always visible */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {todayOutfit.mood && MOOD_CONFIG[todayOutfit.mood as Mood] && (
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      {MOOD_CONFIG[todayOutfit.mood as Mood].emoji} {MOOD_CONFIG[todayOutfit.mood as Mood].label}
                    </Badge>
                  )}
                  {todayOutfit.occasion && OCCASION_LABELS[todayOutfit.occasion as Occasion] && (
                    <Badge variant="outline" className="text-[10px]">
                      {OCCASION_LABELS[todayOutfit.occasion as Occasion]}
                    </Badge>
                  )}
                  {todayOutfit.weather_temp !== null && todayOutfit.weather_temp !== undefined && (
                    <Badge variant="outline" className="text-[10px] gap-0.5">
                      <Thermometer className="h-2.5 w-2.5" />
                      {todayOutfit.weather_temp}°C
                    </Badge>
                  )}
                </div>

                {/* AI reasoning - expanded only */}
                {todayExpanded && todayOutfit.reasoning && (
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    {todayOutfit.reasoning}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-3 mb-8">
        <Link href="/suggest">
          <Button className="w-full h-14 text-base gap-2" size="lg">
            <Sparkles className="h-5 w-5" />
            {todayOutfit ? "Get more suggestions" : "What should I wear today?"}
          </Button>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/wardrobe/add">
            <Button variant="outline" className="w-full h-12 gap-2" size="lg">
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </Link>
          <Link href="/wardrobe">
            <Button variant="outline" className="w-full h-12 gap-2" size="lg">
              <Shirt className="h-4 w-4" />
              My Wardrobe
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent Outfits */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Outfits</h2>
        {recentOutfits.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
            <p className="text-muted-foreground text-sm">
              Your outfit history will appear here.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Tap &quot;Wear Today&quot; on a suggestion to start logging!
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {recentOutfits.slice(0, 7).map((outfit) => (
              <Card key={outfit.date} className="overflow-hidden">
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
                  <div className="flex gap-1.5">
                    {outfit.items.slice(0, 5).map((item) => (
                      <div key={item.id} className="relative h-14 w-14 flex-shrink-0 rounded-md overflow-hidden bg-muted/30">
                        <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
