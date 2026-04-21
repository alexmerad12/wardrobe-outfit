"use client";

import Image from "next/image";
import Link from "next/link";
import type { ClothingItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Heart, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClothingCardProps {
  item: ClothingItem;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function ClothingCard({
  item,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: ClothingCardProps) {
  const content = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
        isSelected && "ring-2 ring-primary",
        item.is_stored && "opacity-60"
      )}
    >
      {/* Image */}
      <div className="relative aspect-square bg-muted/30">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
        />
        {selectMode && (
          <div
            className={cn(
              "absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/80 bg-black/20"
            )}
          >
            {isSelected && <Check className="h-4 w-4" />}
          </div>
        )}
        {!selectMode && item.is_favorite && (
          <div className="absolute right-2 top-2">
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          </div>
        )}
        {!selectMode && item.set_id && (
          <div className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
            <Link2 className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {CATEGORY_LABELS[item.category]}
          </Badge>
          {/* Color dots */}
          <div className="flex gap-0.5">
            {item.colors.slice(0, 3).map((color, i) => (
              <span
                key={i}
                className="inline-block h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (selectMode) {
    return (
      <button type="button" onClick={onToggleSelect} className="text-left">
        {content}
      </button>
    );
  }

  return (
    <Link href={`/wardrobe/${item.id}`}>
      {content}
    </Link>
  );
}

// Skeleton for loading state
export function ClothingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-2.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
