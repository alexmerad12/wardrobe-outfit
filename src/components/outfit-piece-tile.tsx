import Image from "next/image";
import type { ReactNode } from "react";
import type { ClothingItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// One piece of an outfit: its photo and its name in one soft frame, the same
// frame as a wardrobe card (the owner's ask, 2026-11-16: a white photo with
// no edge and the name floating under it read as an empty window). Every
// outfit grid draws its pieces with this, so they can't drift apart: the
// suggested outfit, today's look and recent outfits on Home, favorites, and
// the outfits a try-on builds. The name stays under the photo, never over it
// (his call of 2026-10-24: a band over the photo hid the hems).
//
// The frame fills its grid cell (h-full), so the frames of one row end on the
// same line even when one name takes two lines and the other one.
export function OutfitPieceTile({
  item,
  sizes,
  label,
  photo,
  className,
  children,
}: {
  item: Pick<ClothingItem, "image_url" | "name">;
  /** The `sizes` of the photo for next/image. */
  sizes: string;
  /** Text under the photo, when it isn't the piece's name. */
  label?: string;
  /** Replaces the piece's photo (the try-on's new piece, from the shopper's
   *  own picture). */
  photo?: ReactNode;
  /** Extra classes on the frame (the ring marking a try-on's new piece). */
  className?: string;
  /** Drawn over the photo (the swap button). */
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <div className="relative aspect-square bg-photo">
        {photo ?? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-contain p-2"
            sizes={sizes}
          />
        )}
        {children}
      </div>
      <p className="line-clamp-2 px-2.5 py-2 text-xs font-medium leading-snug">
        {label ?? item.name}
      </p>
    </div>
  );
}
