"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Outfit, ClothingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OutfitsPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOutfits() {
      try {
        const [outfitRes, itemRes] = await Promise.all([
          fetch("/api/outfits"),
          fetch("/api/items"),
        ]);

        const items = outfitRes.ok ? ((await itemRes.json()) as ClothingItem[]) : [];
        setAllItems(items);

        const outfitData = outfitRes.ok ? ((await outfitRes.json()) as Outfit[]) : [];

        const resolvedOutfits = outfitData.map((outfit) => ({
          ...outfit,
          items: outfit.item_ids
            .map((id) => items.find((item) => item.id === id))
            .filter(Boolean) as ClothingItem[],
        }));

        setOutfits(resolvedOutfits);
      } catch (err) {
        console.error("Failed to fetch outfits:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchOutfits();
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Saved Outfits</h1>
          <p className="text-sm text-muted-foreground">
            {outfits.length} {outfits.length === 1 ? "outfit" : "outfits"}
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
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : outfits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-1">No saved outfits yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Get outfit suggestions and save the ones you love!
          </p>
          <Link href="/suggest">
            <Button variant="outline" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Get Suggestions
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {outfits.map((outfit) => (
            <Card
              key={outfit.id}
              className="overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-0">
                {/* Mini grid of items */}
                <div className="grid grid-cols-2 gap-0.5 aspect-square">
                  {(outfit.items ?? []).slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden bg-muted/30"
                    >
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="100px"
                      />
                    </div>
                  ))}
                  {Array.from({
                    length: Math.max(0, 4 - (outfit.items?.length ?? 0)),
                  }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-muted/20" />
                  ))}
                </div>

                {/* Info */}
                <div className="p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">
                      {outfit.name || "Outfit"}
                    </p>
                    {outfit.is_favorite && (
                      <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                  {outfit.rating && (
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-xs",
                            i < outfit.rating!
                              ? "text-yellow-500"
                              : "text-muted-foreground/30"
                          )}
                        >
                          ★
                        </span>
                      ))}
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
