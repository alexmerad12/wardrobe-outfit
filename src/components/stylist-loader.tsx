"use client";

import { useEffect, useState } from "react";
import { Scissors, Ruler, Palette, Pencil, Shirt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS = [
  { Icon: Scissors, label: "Cutting patterns..." },
  { Icon: Ruler, label: "Measuring proportions..." },
  { Icon: Palette, label: "Picking colors..." },
  { Icon: Shirt, label: "Mixing pieces..." },
  { Icon: Pencil, label: "Sketching looks..." },
  { Icon: Sparkles, label: "Adding finishing touches..." },
];

interface StylistLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function StylistLoader({ className, size = "md", showLabel = true }: StylistLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % TOOLS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  const { Icon, label } = TOOLS[index];
  const iconSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <Icon
          key={index}
          className={cn(
            iconSize,
            "text-primary animate-in fade-in zoom-in-50 duration-500"
          )}
        />
      </div>
      {showLabel && (
        <span
          key={`label-${index}`}
          className="text-sm animate-in fade-in slide-in-from-right-1 duration-500"
        >
          {label}
        </span>
      )}
    </div>
  );
}
