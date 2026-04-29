"use client";

import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

interface SwapItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentItem: ClothingItem | null;
  wardrobe: ClothingItem[];
  onSelect: (item: ClothingItem) => void;
  /** Items already in the current outfit — excluded from alternatives
   *  so the user can't accidentally pick a duplicate. */
  excludeIds?: Set<string>;
}

export function SwapItemModal({
  open,
  onOpenChange,
  currentItem,
  wardrobe,
  onSelect,
  excludeIds,
}: SwapItemModalProps) {
  const { t } = useLocale();

  const alternatives = currentItem
    ? wardrobe.filter(
        (it) =>
          it.id !== currentItem.id &&
          it.category === currentItem.category &&
          !it.is_stored &&
          !(excludeIds?.has(it.id))
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        {/* Wrap content in a flex column so the alternatives grid can
            scroll independently and DialogContent's base grid layout
            doesn't fight our row sizing. Capping at 65vh keeps the
            modal compact — only ~3 rows visible at a time so each
            card has room to breathe; the rest is reachable via scroll. */}
        <div className="flex flex-col max-h-[65vh] p-4 gap-3">
          <DialogHeader>
            <DialogTitle>{t("suggest.swapItemTitle")}</DialogTitle>
          </DialogHeader>
          {alternatives.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("suggest.swapNoAlternatives")}
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-2 gap-3 overflow-y-scroll pr-2",
                // flex-1 fills the wrapper's remaining vertical space;
                // min-h-0 lets the grid shrink below its content size,
                // which is what enables overflow-y-scroll to actually
                // engage. Without these, grid items collapse because
                // the grid's height is undeterminate.
                "flex-1 min-h-0",
                // Force every row to a fixed pixel height so rows can't
                // distribute available height unevenly when there are
                // many alternatives. Card = 176px image + ~32px label
                // ≈ 208px. Without this, grid-auto-rows defaults to
                // `auto` which sometimes squashes rows when many cards
                // need to fit a flex-bounded grid.
                "[grid-auto-rows:208px]",
                "[&::-webkit-scrollbar]:w-2",
                "[&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-track]:rounded-full",
                "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50",
                "[scrollbar-width:thin]"
              )}
            >
              {alternatives.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all",
                    "hover:shadow-md hover:border-primary/40 active:scale-95"
                  )}
                >
                  {/* Fixed pixel height (h-44 = 176px) instead of
                      aspect-square — aspect ratios get unreliable
                      inside flex-cols nested in grid-cols, sometimes
                      collapsing card heights. h-44 guarantees every
                      image area is exactly 176px tall, with object-
                      contain showing the full item centered. */}
                  <div className="relative h-44 w-full bg-card shrink-0">
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      fill
                      className="object-contain p-2 transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 45vw, 200px"
                    />
                  </div>
                  <div className="px-2.5 py-2 border-t border-border">
                    <p className="text-xs font-medium truncate">
                      {item.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
