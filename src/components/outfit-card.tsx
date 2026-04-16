"use client";

import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, RotateCcw } from "lucide-react";

interface OutfitCardProps {
  items: ClothingItem[];
  reasoning: string;
  name?: string;
  onSave?: () => void;
  onSkip?: () => void;
  saving?: boolean;
}

export function OutfitCard({ items, reasoning, name, onSave, onSkip, saving }: OutfitCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {name && (
          <h3 className="font-semibold text-sm mb-3">{name}</h3>
        )}

        {/* Outfit items grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-lg bg-muted/30"
            >
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 45vw, 200px"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-xs text-white truncate">{item.name}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Styling note */}
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {reasoning}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onSkip}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Next
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onSave}
            disabled={saving}
          >
            <Heart className="mr-1.5 h-4 w-4" />
            {saving ? "Saving..." : "Favorite"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
