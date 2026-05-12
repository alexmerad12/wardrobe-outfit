"use client";

import { useEffect, useState } from "react";
import { Scissors, Ruler, Palette, Pencil, Shirt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandedName } from "@/components/brand/branded-name";
import { useLocale } from "@/lib/i18n/use-locale";

const TOOLS = [Scissors, Ruler, Palette, Shirt, Pencil, Sparkles];

interface StylistLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  // Optional rotating copy: advances through phases at ~2.2s each. After
  // reaching the last phase, oscillates between the final two so long
  // calls keep showing motion ("still polishing") instead of resetting
  // to "Reviewing wardrobe" (would feel dishonest) or freezing on
  // "Final touches" (would feel stuck). Falls back to `label` /
  // linetteIsStyling when omitted.
  phases?: string[];
}

export function StylistLoader({ className, size = "md", label, phases }: StylistLoaderProps) {
  const { t } = useLocale();
  const [index, setIndex] = useState(0);
  const [entering, setEntering] = useState(true);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!phases || phases.length === 0) return;
    const tick = setTimeout(() => {
      setPhaseIndex((i) => {
        if (phases.length < 2) return i;
        if (i < phases.length - 1) return i + 1;
        return phases.length - 2;
      });
    }, 2200);
    return () => clearTimeout(tick);
  }, [phases, phaseIndex]);

  const effectiveLabel =
    phases && phases.length > 0 ? phases[Math.min(phaseIndex, phases.length - 1)] : (label ?? t("suggest.linetteIsStyling"));

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
        {/* Wrap the label in an inner span so the BrandedName's
            prefix/suffix text nodes aren't flex children of the
            outer container — inline-flex collapses leading/trailing
            whitespace between adjacent text nodes, which would eat
            the space between "Linette" and "is packing". */}
        <span>
          {effectiveLabel.includes("{brand}") ? (
            <BrandedName template={effectiveLabel} scriptClassName="text-base leading-none" />
          ) : (
            effectiveLabel
          )}
        </span>
        <span className="inline-flex ml-0.5">
          <span className="animate-[fade_1.5s_ease-in-out_infinite]">.</span>
          <span className="animate-[fade_1.5s_ease-in-out_infinite] [animation-delay:0.25s]">.</span>
          <span className="animate-[fade_1.5s_ease-in-out_infinite] [animation-delay:0.5s]">.</span>
        </span>
      </span>
    </div>
  );
}
