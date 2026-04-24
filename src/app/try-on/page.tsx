"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Sparkles, ArrowLeft, Loader2, AlertCircle, ChevronDown, X } from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { downscaleImage } from "@/lib/image-utils";
import type { ClothingItem } from "@/lib/types";

type TryOnItem = {
  name: string;
  category: string;
  subcategory: string | null;
  colors: { hex: string; name: string }[];
  material: string[];
  warmth_rating: number | null;
};

type TryOnOutfit = {
  items: ClothingItem[];
  reason: string;
};

type TryOnResult = {
  item: TryOnItem;
  similarItems: ClothingItem[];
  outfits: TryOnOutfit[];
  phantomId: string;
};

export default function TryOnPage() {
  const router = useRouter();
  const { t } = useLocale();
  const labels = useLabels();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TryOnResult | null>(null);
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [expandedOutfit, setExpandedOutfit] = useState<number | null>(null);

  // Cycle through three status messages while analyzing so the 15-20s
  // wait doesn't feel frozen on a single "Analyzing..." label.
  useEffect(() => {
    if (!analyzing) {
      setAnalyzingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setAnalyzingStep((s) => (s + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [analyzing]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(file));
    setAnalyzing(true);
    try {
      // Downscale before upload — saves bandwidth + is fast enough for a
      // 1280px version to still give Claude a clear read.
      const resized = await downscaleImage(file, 1280);
      const body = new FormData();
      body.append("image", resized, "try-on.jpg");
      const res = await fetch("/api/try-on", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Analysis failed");
      }
      setResult(data as TryOnResult);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so picking the same file twice still triggers onChange.
    e.target.value = "";
  }

  function resetAll() {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-tight">{t("tryOn.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("tryOn.subtitle")}</p>
        </div>
      </div>

      {/* Landing: pick a photo */}
      {!previewUrl && !analyzing && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="text-center space-y-1">
              <Sparkles className="h-8 w-8 mx-auto text-primary" />
              <p className="text-sm font-medium">{t("tryOn.howItWorks")}</p>
              <p className="text-xs text-muted-foreground">{t("tryOn.howItWorksSub")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                type="button"
                variant="default"
                onClick={() => cameraInputRef.current?.click()}
                className="h-14 gap-1.5"
              >
                <Camera className="h-4 w-4" />
                {t("tryOn.takePhoto")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => uploadInputRef.current?.click()}
                className="h-14 gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {t("tryOn.upload")}
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPick}
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview + analyzing state */}
      {previewUrl && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-white">
              <Image
                src={previewUrl}
                alt="Uploaded item"
                fill
                className="object-contain p-2"
                sizes="400px"
                unoptimized
              />
              {analyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium transition-opacity duration-300">
                    {analyzingStep === 0
                      ? t("tryOn.analyzingStep1")
                      : analyzingStep === 1
                      ? t("tryOn.analyzingStep2")
                      : t("tryOn.analyzingStep3")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <button
              type="button"
              onClick={resetAll}
              className="underline text-xs mt-1"
            >
              {t("tryOn.tryAgain")}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Identified item attributes */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="editorial-label">
                {t("tryOn.identifiedAs")}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{result.item.name}</p>
                {result.item.subcategory && (
                  <Badge variant="secondary" className="text-[10px]">
                    {labels.SUBCATEGORY_OPTIONS[result.item.category as keyof typeof labels.SUBCATEGORY_OPTIONS]?.find((s) => s.value === result.item.subcategory)?.label ?? result.item.subcategory}
                  </Badge>
                )}
                {result.item.colors.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    className="inline-block h-4 w-4 rounded-full border border-border"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Duplicate detection */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="editorial-label">
                  {t("tryOn.similarInWardrobe")}
                </p>
                <p className="text-sm mt-1">
                  {result.similarItems.length === 0
                    ? t("tryOn.noSimilar")
                    : t(
                        result.similarItems.length === 1
                          ? "tryOn.similarCount"
                          : "tryOn.similarCountPlural",
                        { count: result.similarItems.length }
                      )}
                </p>
              </div>
              {result.similarItems.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {result.similarItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/wardrobe/${item.id}`}
                      className="flex-shrink-0 w-20"
                    >
                      <div className="relative aspect-square rounded-md overflow-hidden bg-white mb-1">
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-contain p-1"
                          sizes="80px"
                        />
                      </div>
                      <p className="text-[10px] truncate">{item.name}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outfit hypotheticals */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="editorial-label">
                  {t("tryOn.outfitsYouCouldBuild")}
                </p>
                <p className="text-sm mt-1">
                  {result.outfits.length === 0
                    ? t("tryOn.noOutfits")
                    : t(
                        result.outfits.length === 1
                          ? "tryOn.outfitsCount"
                          : "tryOn.outfitsCountPlural",
                        { count: result.outfits.length }
                      )}
                </p>
              </div>
              {result.outfits.length > 0 && (
                <div className="space-y-3">
                  {result.outfits.map((outfit, idx) => {
                    const isExpanded = expandedOutfit === idx;
                    return (
                      <div key={idx} className="rounded-lg border overflow-hidden">
                        {/* Header: outfit label + chevron/X toggle */}
                        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
                          <p className="editorial-label">
                            Nº {String(idx + 1).padStart(2, "0")}
                          </p>
                          <button
                            type="button"
                            aria-label={isExpanded ? t("itemDetail.close") : t("common.expand")}
                            onClick={() => setExpandedOutfit(isExpanded ? null : idx)}
                            className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted"
                          >
                            {isExpanded ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>

                        {/* Items grid — compact 4-col when collapsed,
                            bigger 2-col with names when expanded. The
                            phantom item keeps its primary ring in both
                            states so the user can see at a glance
                            which piece is the new one. */}
                        <div className={isExpanded ? "grid grid-cols-2 gap-1.5 px-2 pb-2" : "grid grid-cols-4 gap-1 px-2 pb-2"}>
                          {outfit.items.slice(0, isExpanded ? outfit.items.length : 4).map((item) => (
                            <div
                              key={item.id}
                              className={`relative aspect-square rounded-md overflow-hidden bg-white ${item.id === result.phantomId ? "ring-2 ring-primary" : ""}`}
                            >
                              {item.id === result.phantomId ? (
                                previewUrl ? (
                                  <Image
                                    src={previewUrl}
                                    alt={item.name}
                                    fill
                                    className="object-contain p-1"
                                    sizes={isExpanded ? "(max-width: 640px) 50vw, 250px" : "80px"}
                                    unoptimized
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-xs">
                                    {t("tryOn.newItem")}
                                  </div>
                                )
                              ) : (
                                <Image
                                  src={item.image_url}
                                  alt={item.name}
                                  fill
                                  className="object-contain p-1"
                                  sizes={isExpanded ? "(max-width: 640px) 50vw, 250px" : "80px"}
                                />
                              )}
                              {isExpanded && (
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                                  <p className="truncate text-[10px] text-white">
                                    {item.id === result.phantomId ? t("tryOn.newItem") : item.name}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {outfit.reason && (
                          <div className="px-3 pb-3">
                            <p className={isExpanded ? "stylist-quote text-xs" : "text-xs text-muted-foreground"}>
                              {outfit.reason}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Try another */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetAll}>
              {t("tryOn.tryAnother")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
