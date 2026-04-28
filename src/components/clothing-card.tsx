"use client";

import Image from "next/image";
import Link from "next/link";
import type { ClothingItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Heart, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClothingCardProps {
  item: ClothingItem;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /** Category the user is filtering by — forwarded as a query param so
   *  the item-detail page can return them to the same tab. */
  fromCategory?: string;
  /** Subcategory drill-down so back-nav lands on the same drill-down
   *  view (e.g. tops/shirts) instead of dropping back to tops/all. */
  fromSubcategory?: string;
}

export function ClothingCard({
  item,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  fromCategory,
  fromSubcategory,
}: ClothingCardProps) {
  const content = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
        isSelected && "ring-2 ring-primary",
        item.is_stored && "opacity-60"
      )}
    >
      {/* Image — object-contain so the full item shows. Background is
          pure white to match the flattened image content; a tinted
          muted color created a visible off-white halo between subject
          and card frame. */}
      <div className="relative aspect-square bg-white">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-contain p-2 transition-transform group-hover:scale-105"
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
            <Heart className="h-4 w-4 fill-foreground text-foreground" />
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

  const href = (() => {
    if (!fromCategory) return `/wardrobe/${item.id}`;
    const qs = new URLSearchParams({ from: fromCategory });
    if (fromSubcategory && fromSubcategory !== "all") {
      qs.set("sub", fromSubcategory);
    }
    return `/wardrobe/${item.id}?${qs.toString()}`;
  })();

  return (
    <Link href={href}>
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
