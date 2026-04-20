"use client";

import type { Mood } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/use-locale";
import {
  Zap,
  Crown,
  Palette,
  Cloud,
  Leaf,
  Flame,
  Moon,
  Heart,
  type LucideIcon,
} from "lucide-react";

interface MoodPickerProps {
  selected: Mood | null;
  onChange: (mood: Mood) => void;
}

const MOOD_ICONS: Record<Mood, LucideIcon> = {
  energized: Zap,
  confident: Crown,
  playful: Palette,
  cozy: Cloud,
  chill: Leaf,
  bold: Flame,
  period: Moon,
  sad: Heart,
};

const MOODS = Object.keys(MOOD_CONFIG) as Mood[];

export function MoodPicker({ selected, onChange }: MoodPickerProps) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-4 gap-2">
      {MOODS.map((mood) => {
        const Icon = MOOD_ICONS[mood];
        const isSelected = selected === mood;
        return (
          <button
            key={mood}
            onClick={() => onChange(mood)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all hover:scale-105",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-transparent bg-muted/50 hover:bg-muted"
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6 transition-colors",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="text-xs font-medium">{t(`mood.${mood}.label`)}</span>
          </button>
        );
      })}
    </div>
  );
}
