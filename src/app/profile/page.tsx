"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ClothingItem, Category } from "@/lib/types";
import { ChevronRight, Settings as SettingsIcon } from "lucide-react";
import { InstallPrompt } from "@/components/install-prompt";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { colorFamily, colorFamilySwatch, type ColorFamilyKey } from "@/lib/color-family";
import { formatLastWorn } from "@/lib/relative-time";

export default function ProfilePage() {
  const { t, locale } = useLocale();
  const labels = useLabels();
  const [itemCount, setItemCount] = useState(0);
  const [outfitCount, setOutfitCount] = useState(0);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [itemsRes, outfitsRes, logsRes] = await Promise.all([
          fetch("/api/items"),
          fetch("/api/outfits"),
          fetch("/api/logs"),
        ]);

        if (itemsRes.ok) {
          const items = await itemsRes.json();
          setItemCount(items.length);
          setAllItems(items);
        }

        // 'Outfits worn from Closette' = total wear-log entries whose outfit
        // was AI-generated. Counts every Wear Today click on an AI suggestion
        // (deduped per day server-side).
        if (outfitsRes.ok && logsRes.ok) {
          const outfits = (await outfitsRes.json()) as { id: string; source: string }[];
          const logs = (await logsRes.json()) as { outfit_id: string }[];
          const aiOutfitIds = new Set(
            outfits.filter((o) => o.source === "ai").map((o) => o.id)
          );
          setOutfitCount(logs.filter((l) => aiOutfitIds.has(l.outfit_id)).length);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }
    loadProfile();
  }, []);

  // ---------- Computed stats ----------

  // Bucket every item color into one of 12 color families so the bars
  // stay readable instead of fragmenting across near-identical names
  // ("Crimson" vs "Burgundy" vs "Red"). Family swatch is a canonical
  // mid-tone so the bar reads cleanly regardless of which exact shades
  // the user owns.
  const colorDistribution = useMemo(() => {
    const counts: Record<ColorFamilyKey, number> = {
      red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0,
      pink: 0, brown: 0, beige: 0, black: 0, white: 0, gray: 0,
    };
    for (const item of allItems) {
      for (const color of item.colors ?? []) {
        counts[colorFamily(color.hex)]++;
      }
    }
    return (Object.keys(counts) as ColorFamilyKey[])
      .map((key) => ({ key, hex: colorFamilySwatch(key), count: counts[key] }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [allItems]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return (Object.keys(labels.CATEGORY) as Category[])
      .map((key) => ({ key, label: labels.CATEGORY[key], count: counts[key] ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [allItems, labels]);

  const mostWornItems = useMemo(() => {
    return [...allItems]
      .filter((item) => item.times_worn > 0)
      .sort((a, b) => b.times_worn - a.times_worn)
      .slice(0, 5);
  }, [allItems]);

  const maxColorCount = colorDistribution.length > 0 ? colorDistribution[0].count : 1;
  const maxCategoryCount = categoryBreakdown.length > 0 ? categoryBreakdown[0].count : 1;
  // mostWornItems is sorted desc by times_worn, so [0] is the max — used
  // to scale every wear bar relative to the most-worn piece.
  const maxWornCount = mostWornItems.length > 0 ? mostWornItems[0].times_worn : 1;

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header — title on the left, gear icon → /profile/settings on
          the right. Settings + Account live on their own page so /profile
          stays the engaging surface (stats, insights, discovery hub). */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl font-medium tracking-tight">{t("profile.title")}</h1>
        <Link
          href="/profile/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("profile.settings")}
          title={t("profile.settings")}
        >
          <SettingsIcon className="h-5 w-5" strokeWidth={1.75} />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="font-heading text-4xl font-medium leading-tight">{itemCount}</p>
            <p className="editorial-label mt-1">{t("profile.wardrobeItems")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="font-heading text-4xl font-medium leading-tight">{outfitCount}</p>
            <p className="editorial-label mt-1">{t("profile.savedOutfits")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Wardrobe Insights */}
      {allItems.length > 0 && (
        <Card className="mb-6 animate-in fade-in duration-500">
          <CardHeader>
            <CardTitle className="text-base">{t("profile.wardrobeInsights")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Color Distribution */}
            {colorDistribution.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("profile.topColors")}</p>
                <div className="space-y-1.5">
                  {colorDistribution.map((color) => (
                    <div key={color.key} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0 border border-border"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm w-20 truncate">{t(`colorFamily.${color.key}`)}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-foreground/20"
                          style={{
                            width: `${(color.count / maxColorCount) * 100}%`,
                            backgroundColor: color.hex,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">
                        {color.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {colorDistribution.length > 0 && categoryBreakdown.length > 0 && <Separator />}

            {/* Category Breakdown */}
            {categoryBreakdown.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("profile.categories")}</p>
                <div className="space-y-1.5">
                  {categoryBreakdown.map((cat) => (
                    <div key={cat.key} className="flex items-center gap-2">
                      <span className="text-sm w-24 truncate">{cat.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{
                            width: `${(cat.count / maxCategoryCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">
                        {cat.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(colorDistribution.length > 0 || categoryBreakdown.length > 0) &&
              mostWornItems.length > 0 && <Separator />}

            {/* Most Worn Items — same data-viz language as the color
                and category bars above (label + horizontal bar + count).
                The bar shows wear frequency relative to the most-worn
                piece, the count is the raw number of wears. Recency
                drops below the name as a small caption so we don't
                lose the "two axes" signal (rank vs. how recent). */}
            {mostWornItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("profile.mostWorn")}</p>
                <div className="space-y-2">
                  {mostWornItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/wardrobe/${item.id}`}
                      className="flex items-center gap-2 -mx-1 px-1 py-1 rounded-md hover:bg-muted/50 active:bg-muted transition-colors"
                    >
                      {/* bg-white (not bg-muted) so the white background of
                          bg-removed item images blends in instead of leaving
                          a visible gray halo around each thumbnail. */}
                      <div className="relative h-10 w-10 rounded-md overflow-hidden flex-shrink-0 bg-white">
                        <Image
                          src={item.thumbnail_url ?? item.image_url}
                          alt={item.name}
                          fill
                          className="object-contain p-0.5"
                          sizes="40px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate leading-tight">{item.name}</p>
                        {item.last_worn_date && (
                          <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
                            {formatLastWorn(item.last_worn_date, locale)}
                          </p>
                        )}
                      </div>
                      {/* Compact 48px bar (vs the wider color/category bars
                          above) so the name column stays generous on phones —
                          truncation hits less aggressively. */}
                      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full bg-foreground/30"
                          style={{ width: `${(item.times_worn / maxWornCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-5 text-right tabular-nums flex-shrink-0">
                        {item.times_worn}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Discovery hub — editorial typographic list. No numbers (those
          read as steps and these are independent features). Each row is
          a full-width tap target with a Bodoni title + Inter caption,
          a chevron on the right, and hairline dividers between rows.
          Restraint is the design statement — like a luxury magazine
          ToC. Below the list, a small "Build an outfit" block holds
          the two contextual outfit-creation paths that don't have
          their own destinations. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("profile.whatYouCanDo")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {/* divide-y draws ONE consistent hairline between children, so
              all dividers in this section are guaranteed identical (no
              per-Separator rendering drift). The wrapper is full-bleed
              via no horizontal padding on CardContent + per-child px-6. */}
          <div className="divide-y divide-border">
            <Link
              href="/wardrobe/bulk"
              className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40 active:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg leading-tight">{t("profile.discoverBulkTitle")}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{t("profile.discoverBulkDesc")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
            <Link
              href="/try-on"
              className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40 active:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg leading-tight">{t("profile.discoverTryOnTitle")}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{t("profile.discoverTryOnDesc")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
            <Link
              href="/wardrobe?category=stored"
              className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40 active:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg leading-tight">{t("profile.discoverStorageTitle")}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{t("profile.discoverStorageDesc")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>

            {/* Outfit shortcuts — contextual outfit-creation / refining
                actions that don't have their own destinations. Last
                child of the divide-y wrapper so it gets the hairline
                above. Subhead promoted from editorial-label (faded
                small caps) to plain dark text-sm so the block has a
                visible anchor; bullets at foreground/70 so they're
                readable but don't compete with the destination rows. */}
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{t("profile.discoverOutfitToolsTitle")}</p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-foreground/70">
                <li>{t("profile.discoverTipOutfitWithThis")}</li>
                <li>{t("profile.discoverTipCreateOutfit")}</li>
                <li>{t("profile.discoverTipSwap")}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>


      <InstallPrompt />
    </div>
  );
}
