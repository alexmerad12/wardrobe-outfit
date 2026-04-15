"use client";

import Image from "next/image";
import type { OutfitSuggestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Save, RotateCcw } from "lucide-react";

interface OutfitCardProps {
  suggestion: OutfitSuggestion;
  onSave?: () => void;
  onLove?: () => void;
  onSkip?: () => void;
}

export function OutfitCard({ suggestion, onSave, onLove, onSkip }: OutfitCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* Outfit items grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {suggestion.items.map((item) => (
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
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          {suggestion.reasoning}
        </p>

        {/* Color harmony badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Color harmony:</span>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">
            {suggestion.color_harmony}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onSkip}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Skip
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onSave}
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onLove}
          >
            <Heart className="mr-1.5 h-4 w-4" />
            Love it
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
