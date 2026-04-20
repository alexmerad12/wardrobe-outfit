"use client";

import { useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/use-locale";
import {
  composeOutfitImage,
  shareOutfitImage,
  type OutfitImageItem,
} from "@/lib/outfit-image";

interface ShareOutfitButtonProps {
  items: OutfitImageItem[];
  title: string;          // e.g. outfit name or "Today's Look"
  subtitle?: string;
  filenameBase?: string;  // defaults to "closette-outfit"
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "ghost" | "outline" | "secondary" | "default";
  iconOnly?: boolean;
  className?: string;
}

export function ShareOutfitButton({
  items,
  title,
  subtitle,
  filenameBase = "closette-outfit",
  size = "sm",
  variant = "ghost",
  iconOnly = false,
  className,
}: ShareOutfitButtonProps) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      const blob = await composeOutfitImage({
        items,
        title,
        subtitle,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      await shareOutfitImage(blob, `${filenameBase}-${stamp}.png`);
    } catch (err) {
      console.error("Share outfit failed:", err);
    } finally {
      setBusy(false);
    }
  }

  const icon = busy ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Share2 className="h-4 w-4" />
  );

  if (iconOnly || size === "icon") {
    return (
      <Button
        size="sm"
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={busy || items.length === 0}
        aria-label={t("share.outfit")}
        title={t("share.outfit")}
      >
        {icon}
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className ? `gap-1.5 ${className}` : "gap-1.5"}
      onClick={handleClick}
      disabled={busy || items.length === 0}
    >
      {icon}
      {t("share.outfit")}
    </Button>
  );
}
