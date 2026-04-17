"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherWidget } from "@/components/weather-widget";
import { Sparkles, Plus, Shirt } from "lucide-react";
import type { ClothingItem } from "@/lib/types";

interface TodayOutfit {
  outfit_id: string;
  item_ids: string[];
  name: string | null;
  reasoning: string | null;
  date: string;
}

export default function HomePage() {
  const [todayOutfit, setTodayOutfit] = useState<TodayOutfit | null>(null);
  const [todayItems, setTodayItems] = useState<ClothingItem[]>([]);
  const [recentOutfits, setRecentOutfits] = useState<(TodayOutfit & { items: ClothingItem[] })[]>([]);

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
          <h2 className="text-lg font-semibold mb-3">Today&apos;s Outfit</h2>
          <Card>
            <CardContent className="p-3">
              {todayOutfit.name && (
                <p className="font-medium text-sm mb-2">{todayOutfit.name}</p>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {todayItems.map((item) => (
                  <div key={item.id} className="relative h-20 w-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted/30">
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="80px" />
                  </div>
                ))}
              </div>
              {todayOutfit.reasoning && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {todayOutfit.reasoning}
                </p>
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
