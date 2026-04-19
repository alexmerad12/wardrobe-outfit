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

interface AISuggestion {
  items: ClothingItem[];
  reasoning: string;
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

  const [mood, setMood] = useState<Mood | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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
    "Dress day",
    "Mix patterns",
    "All black",
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
        body: JSON.stringify({ mood, occasion, styleWishes: allWishes, anchorItemId }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
        setWardrobeGap(data.wardrobe_gap ?? null);
        setCurrentIndex(0);
        setStep("results");
      }
    } catch (err) {
      console.error("Failed to generate suggestions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveFavorite(suggestion: AISuggestion) {
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
          source: "ai",
        }),
      });
      handleNext();
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }

  async function wearToday(suggestion: AISuggestion) {
    setSaving(true);
    try {
      // Save as favorite too
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
          mood,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          ai_reasoning: suggestion.reasoning,
          source: "ai",
        }),
      });

      // Set as today's outfit
      await fetch("/api/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: suggestion.items.map((i) => i.id),
          name: suggestion.name,
          reasoning: suggestion.reasoning,
          mood,
          occasion,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          is_favorite: true,
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
          <h1 className="text-xl font-bold">What to Wear</h1>
          <p className="text-sm text-muted-foreground">
            {step === "mood" && "How are you feeling today?"}
            {step === "style" && "Any styling preferences?"}
            {step === "occasion" && "What's the occasion?"}
            {step === "results" && `Suggestion ${currentIndex + 1} of ${suggestions.length}`}
          </p>
        </div>
      </div>

      {/* Anchor item banner */}
      {anchorItem && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4">
          <div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden bg-muted/30">
            <Image src={anchorItem.image_url} alt={anchorItem.name} fill className="object-cover" sizes="56px" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Pin className="h-3 w-3" />
              Styling around this item
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
              How are you feeling?
            </h2>
            <MoodPicker selected={mood} onChange={setMood} />
          </div>
          <Button
            className="w-full h-12"
            disabled={!mood}
            onClick={() => setStep("style")}
          >
            Next
          </Button>
        </div>
      )}

      {/* Step 2: Style wishes (optional) */}
      {step === "style" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-1">
              Any styling direction?
            </h2>
            <p className="text-xs text-muted-foreground mb-3">Optional - tap any that apply</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map((wish) => (
                <button
                  key={wish}
                  onClick={() => toggleStyleWish(wish)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    styleWishes.includes(wish)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {wish}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or type your own... (e.g. 'I want to wear my red boots')"
              value={customWish}
              onChange={(e) => setCustomWish(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("mood")}>
              Back
            </Button>
            <Button className="flex-1 h-12" onClick={() => setStep("occasion")}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Occasion selection */}
      {step === "occasion" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">
              What&apos;s the occasion?
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(OCCASION_LABELS) as [Occasion, string][]).map(
                ([occ, label]) => (
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
                    {label}
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
              Back
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
                  Style Me
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
            name={suggestions[currentIndex].name}
            saving={saving}
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
                That&apos;s all the suggestions for now!
              </p>
              <Button variant="outline" onClick={handleStartOver}>
                Start Over
              </Button>
            </div>
          )}

          {/* Wardrobe gap suggestion from AI */}
          {wardrobeGap && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-2">
              <p className="text-xs font-semibold text-amber-800 mb-1">Stylist tip</p>
              <p className="text-sm text-amber-700">{wardrobeGap}</p>
            </div>
          )}
        </div>
      )}

      {/* No items message */}
      {step === "results" && suggestions.length === 0 && !loading && (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
          <p className="text-muted-foreground mb-2">
            Not enough items in your wardrobe to suggest outfits.
          </p>
          <p className="text-sm text-muted-foreground">
            Add at least 3 items to get started!
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/wardrobe/add")}
          >
            Add Items
          </Button>
        </div>
      )}
    </div>
  );
}
