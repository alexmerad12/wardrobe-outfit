"use client";

import type { Mood } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MoodPickerProps {
  selected: Mood | null;
  onChange: (mood: Mood) => void;
}

const MOODS = Object.entries(MOOD_CONFIG) as [Mood, (typeof MOOD_CONFIG)[Mood]][];

export function MoodPicker({ selected, onChange }: MoodPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MOODS.map(([mood, config]) => (
        <button
          key={mood}
          onClick={() => onChange(mood)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 transition-all hover:scale-105",
            selected === mood
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-transparent bg-muted/50 hover:bg-muted"
          )}
        >
          <span className="text-2xl">{config.emoji}</span>
          <span className="text-xs font-medium">{config.label}</span>
        </button>
      ))}
    </div>
  );
}
