"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Outfit, ClothingItem, Mood } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, Trash2, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FavoritesPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

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
          <h1 className="text-2xl font-bold tracking-tight">Favorite Outfits</h1>
          <p className="text-sm text-muted-foreground">
            Saved looks that inspire future suggestions
          </p>
        </div>
        <Link href="/suggest">
          <Button size="sm" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            New
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : outfits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <Heart className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-1">No favorite outfits yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Get outfit suggestions and save the ones you love. Your favorites help the AI learn your style!
          </p>
          <Link href="/suggest">
            <Button variant="outline" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Get Suggestions
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {outfits.map((outfit) => (
            <Card key={outfit.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Item images row */}
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

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">
                        {outfit.name || "Saved Outfit"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {outfit.mood && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            {MOOD_CONFIG[outfit.mood]?.emoji} {MOOD_CONFIG[outfit.mood]?.label}
                          </Badge>
                        )}
                        {outfit.weather_temp !== null && outfit.weather_temp !== undefined && (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <Thermometer className="h-2.5 w-2.5" />
                            {outfit.weather_temp}°C
                          </Badge>
                        )}
                        {outfit.occasions.slice(0, 2).map((o) => (
                          <Badge key={o} variant="outline" className="text-[10px]">
                            {OCCASION_LABELS[o]}
                          </Badge>
                        ))}
                        {outfit.source === "manual" && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                      </div>
                      {outfit.ai_reasoning && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {outfit.ai_reasoning}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFavorite(outfit.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
