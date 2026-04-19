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

export function StylistLoader({ className, size = "md", label = "Yav is styling..." }: StylistLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % TOOLS.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const Icon = TOOLS[index];
  const iconSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon
        key={index}
        className={cn(
          iconSize,
          "animate-in fade-in zoom-in-50 duration-300"
        )}
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
