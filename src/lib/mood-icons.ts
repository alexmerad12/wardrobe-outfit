// Shared mood -> Lucide icon map so every surface (mood picker, today's
// outfit card, favorites badges...) renders the same tailored icon set
// instead of falling back to the old emojis.

import {
  Zap,
  Crown,
  Rainbow,
  Cloud,
  Leaf,
  Flame,
  Moon,
  Heart,
  type LucideIcon,
} from "lucide-react";
import type { Mood } from "@/lib/types";

export const MOOD_ICONS: Record<Mood, LucideIcon> = {
  energized: Zap,
  confident: Crown,
  playful: Rainbow,
  cozy: Cloud,
  chill: Leaf,
  bold: Flame,
  period: Moon,
  sad: Heart,
};
