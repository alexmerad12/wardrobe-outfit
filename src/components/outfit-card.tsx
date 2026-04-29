"use client";

import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Shirt, ChevronLeft, ChevronRight, Shuffle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/use-locale";

interface OutfitCardProps {
  items: ClothingItem[];
  reasoning: string;
  stylingTip?: string | null;
  name?: string;
  onSave?: () => void;
  onWearToday?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  canNext?: boolean;
  canPrev?: boolean;
  saving?: boolean;
  isFavorited?: boolean;
  /** Per-item swap handler. When provided, each item gets a small
   *  swap icon button in the corner. The handler receives the item
   *  the user wants to replace. Item ids in `lockedItemIds` skip the
   *  swap button (used to lock anchor pieces the user pinned). */
  onSwapItem?: (item: ClothingItem) => void;
  lockedItemIds?: Set<string>;
  /** Optional context badges shown above the outfit name — what the
   *  user asked for so the look reads in the right frame. Each badge
   *  is just a label + optional icon. Pass an empty array (or omit)
   *  to skip the row entirely. */
  contextBadges?: { label: string; icon?: LucideIcon; tone?: "muted" | "primary" }[];
}

export function OutfitCard({
  items,
  reasoning,
  stylingTip,
  name,
  onSave,
  onWearToday,
  onNext,
  onPrev,
  canNext = true,
  canPrev = false,
  saving,
  isFavorited = false,
  onSwapItem,
  lockedItemIds,
  contextBadges,
}: OutfitCardProps) {
  const { t } = useLocale();
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* Context badges — what the user asked for (mood / occasion /
            style direction). Sits just above the look name so the user
            reads the outfit in the same frame they requested. */}
        {contextBadges && contextBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {contextBadges.map((badge, i) => {
              const BadgeIcon = badge.icon;
              return (
                <span
                  key={`${badge.label}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                    badge.tone === "primary"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                  {badge.label}
                </span>
              );
            })}
          </div>
        )}
        {name && (
          <h3 className="font-heading text-lg font-medium mb-3 tracking-tight">{name}</h3>
        )}

        {/* Outfit items grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {items.map((item) => {
            const swappable = !!onSwapItem && !lockedItemIds?.has(item.id);
            return (
              <div
                key={item.id}
                className="relative aspect-square overflow-hidden rounded-lg bg-card"
              >
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  className="object-contain p-2"
                  sizes="(max-width: 640px) 45vw, 200px"
                />
                {swappable && (
                  <button
                    type="button"
                    onClick={() => onSwapItem?.(item)}
                    aria-label={t("suggest.swap")}
                    className={cn(
                      "absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center",
                      "rounded-full bg-background/90 text-foreground shadow-sm border border-border/60",
                      "transition-all hover:bg-background hover:scale-105 active:scale-95"
                    )}
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-xs text-white truncate">{item.name}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Styling note */}
        <p className="stylist-quote text-sm mb-3">
          {reasoning}
        </p>

        {/* Stylist's how-to-wear tip — only shown when the AI provided one. */}
        {stylingTip && (
          <div className="mb-4 border-t border-b border-border py-2.5">
            <p className="editorial-label mb-1">{t("suggest.stylistTip")}</p>
            <p className="text-xs leading-relaxed">{stylingTip}</p>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex gap-2 mb-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex-1",
              isFavorited && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/5 hover:text-primary"
            )}
            onClick={onSave}
            disabled={saving || isFavorited}
          >
            {isFavorited ? (
              <>
                <Heart className="mr-1.5 h-4 w-4 fill-current" />
                {t("suggest.saved")}
              </>
            ) : (
              <>
                <Heart className="mr-1.5 h-4 w-4" />
                {saving ? t("common.saving") : t("suggest.favorite")}
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onWearToday}
            disabled={saving}
          >
            <Shirt className="mr-1.5 h-4 w-4" />
            {t("suggest.wearToday")}
          </Button>
        </div>

        {/* Browse navigation — only rendered when prev/next handlers
            are supplied. With single-outfit mode the suggest page
            shows a "Show me another" button instead. */}
        {(onPrev || onNext) && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={onPrev}
              disabled={!canPrev}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("common.previous")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={onNext}
              disabled={!canNext}
            >
              {t("common.next")}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
