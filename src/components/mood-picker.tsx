"use client";

import type { Mood } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { MOOD_ICONS } from "@/lib/mood-icons";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/use-locale";

interface MoodPickerProps {
  selected: Mood | null;
  onChange: (mood: Mood) => void;
}

const MOODS = Object.keys(MOOD_CONFIG) as Mood[];

export function MoodPicker({ selected, onChange }: MoodPickerProps) {
  const { tMood } = useLocale();
  return (
    <div className="space-y-3">
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
              <span className="text-xs font-medium">{tMood(mood, "label")}</span>
            </button>
          );
        })}
      </div>
      {/* Selected mood description — only renders when a mood is picked, so
          the picker stays compact by default and grows by one line of italic
          text once the user has chosen. Acts as a confirmation of "what
          does this mean" without forcing extra height on every card. */}
      {selected && (
        <p className="text-xs italic text-muted-foreground text-center px-2 leading-relaxed animate-in fade-in duration-200">
          {tMood(selected, "description")}
        </p>
      )}
    </div>
  );
}
