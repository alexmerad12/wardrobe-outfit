"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import {
  CATEGORY_LABELS,
  FIT_LABELS,
  MATERIAL_LABELS,
  PATTERN_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  OCCASION_LABELS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Heart, Trash2, Droplets, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`/api/items/${params.id}`);
        if (res.ok) {
          setItem(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch item:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [params.id]);

  async function toggleFavorite() {
    if (!item) return;
    const newFav = !item.is_favorite;
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newFav }),
    });
    if (res.ok) {
      setItem({ ...item, is_favorite: newFav });
    }
  }

  async function deleteItem() {
    if (!item || !confirm("Delete this item from your wardrobe?")) return;
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    router.push("/wardrobe");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="h-8 w-8 animate-pulse rounded bg-muted mb-4" />
        <div className="aspect-square animate-pulse rounded-xl bg-muted mb-4" />
        <div className="h-6 w-48 animate-pulse rounded bg-muted mb-2" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 text-center">
        <p className="text-muted-foreground">Item not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/wardrobe")}
        >
          Back to Wardrobe
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={toggleFavorite}>
            <Heart
              className={cn(
                "h-5 w-5",
                item.is_favorite && "fill-red-500 text-red-500"
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={deleteItem}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted/30 mb-4">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover"
          sizes="(max-width: 448px) 100vw, 448px"
          priority
        />
      </div>

      {/* Name & category */}
      <h1 className="text-xl font-bold mb-1">{item.name}</h1>
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="secondary">{CATEGORY_LABELS[item.category]}</Badge>
        {item.subcategory && (
          <Badge variant="outline">{item.subcategory}</Badge>
        )}
        {item.brand && (
          <span className="text-sm text-muted-foreground">{item.brand}</span>
        )}
      </div>

      {/* Colors */}
      {item.colors.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Colors:</span>
          <div className="flex gap-1.5">
            {item.colors.map((color, i) => (
              <div key={i} className="flex items-center gap-1">
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-xs text-muted-foreground">
                  {color.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator className="my-4" />

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Fit</p>
            <p className="text-sm font-medium">{FIT_LABELS[item.fit]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Material</p>
            <p className="text-sm font-medium">
              {MATERIAL_LABELS[item.material]}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Pattern</p>
            <p className="text-sm font-medium">
              {PATTERN_LABELS[item.pattern]}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Formality</p>
            <p className="text-sm font-medium">
              {FORMALITY_LABELS[item.formality]}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warmth & Rain */}
      <div className="flex gap-3 mt-3">
        <Card className="flex-1">
          <CardContent className="p-3 flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Warmth</p>
              <p className="text-sm font-medium">{item.warmth_rating}/5</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="p-3 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Rain-proof</p>
              <p className="text-sm font-medium">
                {item.rain_appropriate ? "Yes" : "No"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seasons */}
      {item.seasons.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">Seasons</p>
          <div className="flex flex-wrap gap-1.5">
            {item.seasons.map((s) => (
              <Badge key={s} variant="outline">
                {SEASON_LABELS[s]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Occasions */}
      {item.occasions.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground mb-2">Occasions</p>
          <div className="flex flex-wrap gap-1.5">
            {item.occasions.map((o) => (
              <Badge key={o} variant="outline">
                {OCCASION_LABELS[o]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Wear stats */}
      <Separator className="my-4" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Times worn</span>
        <span className="font-medium">{item.times_worn}</span>
      </div>
      {item.last_worn_date && (
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-muted-foreground">Last worn</span>
          <span className="font-medium">
            {new Date(item.last_worn_date).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
}
