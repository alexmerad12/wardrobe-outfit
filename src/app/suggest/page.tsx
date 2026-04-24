"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/weather-widget";
import { MoodPicker } from "@/components/mood-picker";
import { OutfitCard } from "@/components/outfit-card";
import type { Mood, Occasion, ClothingItem } from "@/lib/types";
import { OCCASION_LABELS } from "@/lib/types";
import { Sparkles, Loader2, ArrowLeft, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { StylistLoader } from "@/components/stylist-loader";
import { getLocalDateString } from "@/lib/local-date";
import { useLocale } from "@/lib/i18n/use-locale";

interface AISuggestion {
  items: ClothingItem[];
  reasoning: string;
  styling_tip: string | null;
  name: string;
  mood_match: Mood;
  weather_temp: number | null;
  weather_condition: string | null;
}

export default function SuggestPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 pt-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
      <SuggestContent />
    </Suspense>
  );
}

function SuggestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const anchorItemId = searchParams.get("item");
  const { t, locale } = useLocale();

  const [mood, setMood] = useState<Mood | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favoritedIndices, setFavoritedIndices] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"mood" | "style" | "occasion" | "results">("mood");
  const [saving, setSaving] = useState(false);
  const [styleWishes, setStyleWishes] = useState<string[]>([]);
  const [customWish, setCustomWish] = useState("");
  const [wardrobeGap, setWardrobeGap] = useState<string | null>(null);
  const [anchorItem, setAnchorItem] = useState<ClothingItem | null>(null);

  // Load the anchor item if one was passed
  useEffect(() => {
    if (!anchorItemId) return;
    fetch(`/api/items/${anchorItemId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setAnchorItem)
      .catch(() => {});
  }, [anchorItemId]);

  const STYLE_PRESETS = [
    { key: "dress-day", label: t("styleWish.dress-day") },
    { key: "mix-patterns", label: t("styleWish.mix-patterns") },
    { key: "all-black", label: t("styleWish.all-black") },
  ];

  function toggleStyleWish(wish: string) {
    setStyleWishes((prev) =>
      prev.includes(wish) ? prev.filter((w) => w !== wish) : [...prev, wish]
    );
  }

  async function generateSuggestions() {
    setLoading(true);

    try {
      const allWishes = [...styleWishes];
      if (customWish.trim()) allWishes.push(customWish.trim());

      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, occasion, styleWishes: allWishes, anchorItemId, locale }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
        setWardrobeGap(data.wardrobe_gap ?? null);
        setCurrentIndex(0);
        setFavoritedIndices(new Set());
        setStep("results");
      }
    } catch (err) {
      console.error("Failed to generate suggestions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveFavorite(suggestion: AISuggestion) {
    // Guard against double-save on the same suggestion
    if (favoritedIndices.has(currentIndex) || saving) return;
    setSaving(true);
    try {
      await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          name: suggestion.name,
          item_ids: suggestion.items.map((i) => i.id),
          occasions: occasion ? [occasion] : [],
          seasons: [],
          rating: null,
          is_favorite: true,
          mood: mood,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          ai_reasoning: suggestion.reasoning,
          styling_tip: suggestion.styling_tip,
          source: "ai",
        }),
      });
      setFavoritedIndices((prev) => new Set(prev).add(currentIndex));
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }

  async function wearToday(suggestion: AISuggestion) {
    setSaving(true);
    try {
      // Persist the outfit first, then pass its id into the today
      // endpoint so the outfit_log entry references the real outfit
      // row. Without this link the profile's "AI outfits worn" count
      // stays at 0 — the log's outfit_id doesn't match any outfit.
      const outfitRes = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          name: suggestion.name,
          item_ids: suggestion.items.map((i) => i.id),
          occasions: occasion ? [occasion] : [],
          seasons: [],
          rating: null,
          is_favorite: false,
          mood,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          ai_reasoning: suggestion.reasoning,
          styling_tip: suggestion.styling_tip,
          source: "ai",
        }),
      });
      const savedOutfit = outfitRes.ok
        ? ((await outfitRes.json()) as { id?: string })
        : null;

      // Set as today's outfit — pass outfit_id so the wear log links
      // back to the outfit we just created.
      await fetch("/api/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outfit_id: savedOutfit?.id,
          item_ids: suggestion.items.map((i) => i.id),
          name: suggestion.name,
          reasoning: suggestion.reasoning,
          styling_tip: suggestion.styling_tip,
          mood,
          occasion,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          is_favorite: false,
          date: getLocalDateString(),
        }),
      });

      router.push("/");
    } catch (err) {
      console.error("Failed to set today:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }

  function handleStartOver() {
    setStep("mood");
    setMood(null);
    setOccasion(null);
    setSuggestions([]);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-tight">{t("suggest.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {step === "results"
              ? t("suggest.suggestionCounter", { current: currentIndex + 1, total: suggestions.length })
              : t("suggest.stepTagline")}
          </p>
        </div>
      </div>

      {/* Anchor item banner */}
      {anchorItem && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4">
          <div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden bg-muted/30">
            <Image src={anchorItem.image_url} alt={anchorItem.name} fill className="object-contain p-1" sizes="56px" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Pin className="h-3 w-3" />
              {t("suggest.stylingAround")}
            </p>
            <p className="text-sm font-medium truncate">{anchorItem.name}</p>
          </div>
        </div>
      )}

      {/* Weather context */}
      <div className="mb-6">
        <WeatherWidget />
      </div>

      {/* Step 1: Mood selection */}
      {step === "mood" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">
              {t("suggest.howAreYouFeelingShort")}
            </h2>
            <MoodPicker selected={mood} onChange={setMood} />
          </div>
          <Button
            className="w-full h-12"
            disabled={!mood}
            onClick={() => setStep("style")}
          >
            {t("common.next")}
          </Button>
        </div>
      )}

      {/* Step 2: Style wishes (optional) */}
      {step === "style" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-1">
              {t("suggest.anyDirection")}
            </h2>
            <p className="text-xs text-muted-foreground mb-3">{t("suggest.optional")}</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleStyleWish(label)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    styleWishes.includes(label)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder={t("suggest.customWishPlaceholder")}
              value={customWish}
              onChange={(e) => setCustomWish(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("mood")}>
              {t("common.back")}
            </Button>
            <Button className="flex-1 h-12" onClick={() => setStep("occasion")}>
              {t("common.next")}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Occasion selection */}
      {step === "occasion" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">
              {t("suggest.whatsOccasionShort")}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(OCCASION_LABELS) as Occasion[]).map(
                (occ) => (
                  <button
                    key={occ}
                    onClick={() => setOccasion(occ)}
                    className={cn(
                      "rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                      occasion === occ
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    {t(`occasion.${occ}`)}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setStep("style")}
            >
              {t("common.back")}
            </Button>
            <Button
              className="flex-1 h-12 gap-2"
              disabled={!occasion || loading}
              onClick={generateSuggestions}
            >
              {loading ? (
                <StylistLoader size="sm" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("suggest.styleMe")}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === "results" && suggestions.length > 0 && (
        <div className="space-y-4">
          <OutfitCard
            items={suggestions[currentIndex].items}
            reasoning={suggestions[currentIndex].reasoning}
            stylingTip={suggestions[currentIndex].styling_tip}
            name={suggestions[currentIndex].name}
            saving={saving}
            isFavorited={favoritedIndices.has(currentIndex)}
            onNext={handleNext}
            onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            canNext={currentIndex < suggestions.length - 1}
            canPrev={currentIndex > 0}
            onSave={() => saveFavorite(suggestions[currentIndex])}
            onWearToday={() => wearToday(suggestions[currentIndex])}
          />

          {currentIndex >= suggestions.length - 1 && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("suggest.thatsAll")}
              </p>
              <Button variant="outline" onClick={handleStartOver}>
                {t("suggest.startOver")}
              </Button>
            </div>
          )}

          {/* Wardrobe gap suggestion from AI */}
          {wardrobeGap && (
            <div className="mt-2 border-t border-b border-border py-3">
              <p className="editorial-label mb-1.5">{t("suggest.stylistTip")}</p>
              <p className="stylist-quote text-sm">{wardrobeGap}</p>
            </div>
          )}
        </div>
      )}

      {/* No items message */}
      {step === "results" && suggestions.length === 0 && !loading && (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
          <p className="text-muted-foreground mb-2">
            {t("suggest.notEnoughItems")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("suggest.atLeast3Items")}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/wardrobe/add")}
          >
            {t("suggest.addItems")}
          </Button>
        </div>
      )}
    </div>
  );
}
