"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/weather-widget";
import { MoodPicker } from "@/components/mood-picker";
import { OutfitCard } from "@/components/outfit-card";
import type { Mood, Occasion, ClothingItem } from "@/lib/types";
import { OCCASION_LABELS } from "@/lib/types";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface AISuggestion {
  items: ClothingItem[];
  reasoning: string;
  name: string;
  mood_match: Mood;
  weather_temp: number | null;
  weather_condition: string | null;
}

export default function SuggestPage() {
  const router = useRouter();
  const [mood, setMood] = useState<Mood | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<"mood" | "occasion" | "results">("mood");
  const [saving, setSaving] = useState(false);

  async function generateSuggestions() {
    setLoading(true);

    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, occasion }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
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
            {step === "occasion" && "What's the occasion?"}
            {step === "results" && `Suggestion ${currentIndex + 1} of ${suggestions.length}`}
          </p>
        </div>
      </div>

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
            onClick={() => setStep("occasion")}
          >
            Next
          </Button>
        </div>
      )}

      {/* Step 2: Occasion selection */}
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
              onClick={() => setStep("mood")}
            >
              Back
            </Button>
            <Button
              className="flex-1 h-12 gap-2"
              disabled={!occasion || loading}
              onClick={generateSuggestions}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Yav is styling...
                </>
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
            onSkip={handleNext}
            onSave={() => saveFavorite(suggestions[currentIndex])}
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
