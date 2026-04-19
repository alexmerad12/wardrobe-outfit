"use client";

import { useEffect, useState } from "react";
import { Scissors, Ruler, Palette, Pencil, Shirt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS = [Scissors, Ruler, Palette, Shirt, Pencil, Sparkles];

interface StylistLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function StylistLoader({ className, size = "md", label = "Yav is styling" }: StylistLoaderProps) {
  const [index, setIndex] = useState(0);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    // Cycle: visible ~310ms, fade out ~140ms, swap
    const cycleMs = 450;
    const fadeOutAt = 310;

    const fadeOut = setTimeout(() => setEntering(false), fadeOutAt);
    const swap = setTimeout(() => {
      setIndex((i) => (i + 1) % TOOLS.length);
      setEntering(true);
    }, cycleMs);

    return () => {
      clearTimeout(fadeOut);
      clearTimeout(swap);
    };
  }, [index]);

  const Icon = TOOLS[index];
  const iconSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon
        className={cn(
          iconSize,
          "transition-all duration-150 ease-in-out",
          entering ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-75 -rotate-12"
        )}
      />
      <span className="text-sm inline-flex items-baseline">
        {label}
        <span className="inline-flex ml-0.5">
          <span className="animate-[fade_1.5s_ease-in-out_infinite]">.</span>
          <span className="animate-[fade_1.5s_ease-in-out_infinite] [animation-delay:0.25s]">.</span>
          <span className="animate-[fade_1.5s_ease-in-out_infinite] [animation-delay:0.5s]">.</span>
        </span>
      </span>
    </div>
  );
}
