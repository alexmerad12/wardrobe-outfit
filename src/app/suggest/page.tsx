"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/weather-widget";
import { MoodPicker } from "@/components/mood-picker";
import { OutfitCard } from "@/components/outfit-card";
import { SwapItemModal } from "@/components/swap-item-modal";
import type { Mood, Occasion, ClothingItem } from "@/lib/types";
import { OCCASION_LABELS } from "@/lib/types";
import { Sparkles, Loader2, ArrowLeft, Pin, Plus } from "lucide-react";
import { MOOD_ICONS } from "@/lib/mood-icons";
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
  // Server sets this when the outfit shipped through a degraded path
  // (soft admit / emergency fallback / safety net) — i.e. at least one
  // styling rule was relaxed to avoid returning nothing.
  relaxed?: boolean;
  // Snapshot of items as the AI originally suggested them. Set when
  // the suggestion arrives and never mutated. items[] is what the user
  // sees / can edit; originalItems is the diff baseline used to build
  // the swap-pairs feedback signal at save time.
  originalItems: ClothingItem[];
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
  const { t, tMood, locale } = useLocale();

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
  const [aiError, setAiError] = useState(false);
  // Beta cost cap — when /api/suggest returns 429, show a "you've
  // reached today's limit" empty-state instead of the generic AI-error
  // message (the action to take is wait, not retry).
  const [limitError, setLimitError] = useState(false);
  const [anchorItem, setAnchorItem] = useState<ClothingItem | null>(null);

  // Wardrobe cached on mount so the swap modal can show alternatives
  // without a per-tap fetch. Cheap (~1 request, <500 items typically).
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  // Gates the empty-wardrobe CTA so we don't flash it during initial
  // load before the wardrobe fetch resolves.
  const [wardrobeLoaded, setWardrobeLoaded] = useState(false);
  // Swap modal state — which item we're swapping (null = closed).
  const [swapTargetItem, setSwapTargetItem] = useState<ClothingItem | null>(null);

  // Load the anchor item if one was passed
  useEffect(() => {
    if (!anchorItemId) return;
    fetch(`/api/items/${anchorItemId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setAnchorItem)
      .catch(() => {});
  }, [anchorItemId]);

  // Load full wardrobe once for swap-modal alternatives AND the
  // empty-wardrobe CTA below. Same fetch serves both — no second call.
  useEffect(() => {
    fetch("/api/items")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setWardrobe(data);
        setWardrobeLoaded(true);
      })
      .catch(() => setWardrobeLoaded(true));
  }, []);

  // Active wardrobe count (stored items don't count — the suggest API
  // filters them out). Matches the API's `items.length < 3` gate so
  // we surface the empty state before the user invests time in the
  // mood/occasion form only to hit the same threshold server-side.
  const activeWardrobeCount = wardrobe.filter((i) => !i.is_stored).length;
  const showEmptyWardrobeCTA =
    wardrobeLoaded && activeWardrobeCount < 3 && step !== "results";

  // Replace an item in the current suggestion with the chosen
  // alternative. Local-only — saving as a favorite uses the edited
  // outfit. Edits reset whenever a new suggestion arrives.
  function applySwap(replacement: ClothingItem) {
    if (!swapTargetItem) return;
    setSuggestions((prev) =>
      prev.map((s, i) => {
        if (i !== 0) return s;
        return {
          ...s,
          items: s.items.map((it) =>
            it.id === swapTargetItem.id ? replacement : it
          ),
        };
      })
    );
  }

  const STYLE_PRESETS = [
    { key: "dress-day", label: t("styleWish.dress-day") },
    { key: "mix-patterns", label: t("styleWish.mix-patterns") },
    { key: "all-black", label: t("styleWish.all-black") },
    { key: "full-denim", label: t("styleWish.full-denim") },
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
        // Snapshot the AI's original item picks so we can detect swaps
        // at save time. Spread into a new array so later mutations on
        // .items don't bleed into originalItems.
        const withOriginals: AISuggestion[] = (data.suggestions ?? []).map(
          (s: AISuggestion) => ({ ...s, originalItems: [...s.items] })
        );
        setSuggestions(withOriginals);
        setWardrobeGap(data.wardrobe_gap ?? null);
        setAiError(Boolean(data.ai_error));
        setLimitError(false);
        setCurrentIndex(0);
        setFavoritedIndices(new Set());
        setStep("results");
      } else if (res.status === 429) {
        // Daily cap reached — show the dedicated limit empty-state
        // (different message from generic AI failure: action is "wait",
        // not "retry").
        setSuggestions([]);
        setWardrobeGap(null);
        setLimitError(true);
        setAiError(false);
        setCurrentIndex(0);
        setFavoritedIndices(new Set());
        setStep("results");
      } else {
        // Non-2xx response — surface as the AI-error state so the user
        // sees something instead of the form sitting there silent. This
        // catches server crashes, Gemini timeouts, and any other backend
        // failure that the success path would otherwise swallow.
        const errBody = await res.text().catch(() => "");
        console.error(
          `[suggest] API returned ${res.status}:`,
          errBody.slice(0, 500)
        );
        setSuggestions([]);
        setWardrobeGap(null);
        setAiError(true);
        setLimitError(false);
        setCurrentIndex(0);
        setFavoritedIndices(new Set());
        setStep("results");
      }
    } catch (err) {
      console.error("Failed to generate suggestions:", err);
      // Network failure or fetch threw — show the same error state so
      // the user can retry instead of the page silently doing nothing.
      setSuggestions([]);
      setWardrobeGap(null);
      setAiError(true);
      setCurrentIndex(0);
      setFavoritedIndices(new Set());
      setStep("results");
    } finally {
      setLoading(false);
    }
  }

  // Diff helpers — derive swap pairs from the original AI suggestion
  // vs the current (possibly user-edited) item set. The shape returned
  // matches what /api/outfits expects in `swap_pairs`. Returns an empty
  // array when nothing was edited; that doubles as the "edited?" check
  // — the save flow keys off pairs.length > 0.
  function computeSwapPairs(
    suggestion: AISuggestion,
    savedVia: "favorite" | "wear_today"
  ): Array<{
    original_item_id: string;
    replacement_item_id: string;
    occasion: Occasion | null;
    mood: Mood | null;
    weather_temp: number | null;
    weather_condition: string | null;
    season: string | null;
    saved_via: "favorite" | "wear_today";
  }> {
    const originalById = new Map(suggestion.originalItems.map((it) => [it.id, it]));
    const currentIds = new Set(suggestion.items.map((it) => it.id));
    const pairs = [];
    for (const orig of suggestion.originalItems) {
      if (currentIds.has(orig.id)) continue;
      // This original was dropped. Find what replaced it — same
      // category in the current items that wasn't in the originals.
      const replacement = suggestion.items.find(
        (it) => it.category === orig.category && !originalById.has(it.id)
      );
      if (!replacement) continue;
      pairs.push({
        original_item_id: orig.id,
        replacement_item_id: replacement.id,
        occasion,
        mood,
        weather_temp: suggestion.weather_temp,
        weather_condition: suggestion.weather_condition,
        season: seasonFromDate(),
        saved_via: savedVia,
      });
    }
    return pairs;
  }

  // Local season derivation matching the suggest engine's bands.
  // Northern-hemisphere bias is fine for our beta footprint.
  function seasonFromDate(): string {
    const m = new Date().getMonth();
    if (m >= 2 && m <= 4) return "spring";
    if (m >= 5 && m <= 7) return "summer";
    if (m >= 8 && m <= 10) return "fall";
    return "winter";
  }

  // Re-write reasoning + styling_tip for an edited outfit. Wrapped so
  // the save flow can graceful-degrade: if the refine call fails for
  // any reason (network, rate limit, parse error) we fall back to the
  // original suggestion's text. Save MUST NOT fail because of refine.
  async function refineEditedOutfit(
    suggestion: AISuggestion
  ): Promise<{ reasoning: string; styling_tip: string | null }> {
    try {
      const res = await fetch("/api/suggest/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: suggestion.items.map((i) => i.id),
          occasion,
          mood,
          weather_temp: suggestion.weather_temp,
          weather_condition: suggestion.weather_condition,
          locale,
        }),
      });
      if (!res.ok) {
        return {
          reasoning: suggestion.reasoning,
          styling_tip: suggestion.styling_tip,
        };
      }
      const data = (await res.json()) as {
        reasoning?: string;
        styling_tip?: string | null;
      };
      return {
        reasoning: data.reasoning ?? suggestion.reasoning,
        styling_tip: data.styling_tip ?? suggestion.styling_tip,
      };
    } catch {
      return {
        reasoning: suggestion.reasoning,
        styling_tip: suggestion.styling_tip,
      };
    }
  }

  async function saveFavorite(suggestion: AISuggestion) {
    // Guard against double-save on the same suggestion
    if (favoritedIndices.has(currentIndex) || saving) return;
    setSaving(true);
    try {
      const swapPairs = computeSwapPairs(suggestion, "favorite");
      // Only refine when the user actually edited the outfit. No edits
      // = no AI cost, save flow byte-for-byte identical to before.
      const { reasoning, styling_tip } =
        swapPairs.length > 0
          ? await refineEditedOutfit(suggestion)
          : { reasoning: suggestion.reasoning, styling_tip: suggestion.styling_tip };
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
          ai_reasoning: reasoning,
          styling_tip: styling_tip,
          source: "ai",
          swap_pairs: swapPairs,
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
      const swapPairs = computeSwapPairs(suggestion, "wear_today");
      const { reasoning, styling_tip } =
        swapPairs.length > 0
          ? await refineEditedOutfit(suggestion)
          : { reasoning: suggestion.reasoning, styling_tip: suggestion.styling_tip };
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
          ai_reasoning: reasoning,
          styling_tip: styling_tip,
          source: "ai",
          swap_pairs: swapPairs,
        }),
      });
      const savedOutfit = outfitRes.ok
        ? ((await outfitRes.json()) as { id?: string })
        : null;

      // Set as today's outfit — pass outfit_id so the wear log links
      // back to the outfit we just created. Use the REFINED reasoning
      // / styling_tip when the user edited the outfit, so the home
      // page's "today" card matches the items actually being worn.
      // Phase 1 missed this — was passing suggestion.reasoning (the
      // pre-edit text), so swapped outfits showed stale descriptions.
      await fetch("/api/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outfit_id: savedOutfit?.id,
          item_ids: suggestion.items.map((i) => i.id),
          name: suggestion.name,
          reasoning: reasoning,
          styling_tip: styling_tip,
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

  function handleStartOver() {
    setStep("mood");
    setMood(null);
    setOccasion(null);
    setSuggestions([]);
  }

  // "Show me another" — re-generate a fresh single outfit for the same
  // mood/occasion/style direction. The server's recent-suggestions KV
  // ensures the new outfit differs from the one(s) just shown.
  async function handleShowAnother() {
    await generateSuggestions();
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-tight">{t("suggest.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {step === "results"
              ? t("suggest.singleOutfitTagline")
              : t("suggest.stepTagline")}
          </p>
        </div>
      </div>

      {/* Anchor item banner — hidden when the wardrobe is too thin to
          style anything; the "styling around X" promise can't be
          fulfilled until the user has at least 3 pieces. */}
      {anchorItem && !showEmptyWardrobeCTA && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4">
          <div className="relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden bg-card">
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

      {/* Weather context — hidden in the empty state since there's no
          outfit to weather-adjust yet. */}
      {!showEmptyWardrobeCTA && (
        <div className="mb-4">
          <WeatherWidget />
        </div>
      )}

      {/* Empty wardrobe CTA — replaces the mood/style/occasion form
          when the user has fewer than 3 active pieces. Leads with the
          add-items action and includes a preview of what styling will
          look like once they're ready, so the screen teaches the
          feature instead of leaving them at a dead end. */}
      {showEmptyWardrobeCTA && (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="font-heading text-lg mb-1.5">
            {t("suggest.empty.title")}
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            {t("suggest.empty.subtitle")}
          </p>
          <Button
            className="gap-1.5"
            onClick={() => router.push("/wardrobe/add")}
          >
            <Plus className="h-4 w-4" />
            {t("suggest.addItems")}
          </Button>
          {/* Subtle pointer at the global FAB so a first-time user
              learns there's a persistent "+" they can use from now on.
              Muted text-xs so it doesn't compete with the primary
              button — it's a teaching aid, not a second affordance. */}
          <p className="mt-3 text-xs text-muted-foreground">
            {t("common.orTapPlus")}
          </p>
          <div className="mt-7 pt-5 border-t border-muted-foreground/10 text-left">
            <p className="text-xs font-medium text-foreground mb-3">
              {t("suggest.empty.previewTitle")}
            </p>
            <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>• {t("suggest.empty.previewMood")}</li>
              <li>• {t("suggest.empty.previewWish")}</li>
              <li>• {t("suggest.empty.previewSwap")}</li>
            </ul>
          </div>
        </div>
      )}

      {/* Skeleton — covers the brief window between mount and the
          wardrobe fetch resolving, so we don't flash either the form
          (to a wardrobe-less user) or the empty CTA (to an established
          user) before we know which one belongs here. */}
      {!wardrobeLoaded && step !== "results" && (
        <div className="space-y-4">
          <div className="h-6 w-1/2 animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Mood selection */}
      {wardrobeLoaded && !showEmptyWardrobeCTA && step === "mood" && (
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
      {wardrobeLoaded && !showEmptyWardrobeCTA && step === "style" && (
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
      {wardrobeLoaded && !showEmptyWardrobeCTA && step === "occasion" && (
        <div className="space-y-4">
          <div className="space-y-3">
            <h2 className="text-base font-semibold mb-2">
              {t("suggest.whatsOccasionShort")}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(OCCASION_LABELS) as Occasion[]).map(
                (occ) => (
                  <button
                    key={occ}
                    onClick={() => setOccasion(occ)}
                    className={cn(
                      "rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
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
            {/* Selected-occasion description — same pattern as MoodPicker,
                small italic line confirming what the picked occasion means. */}
            {occasion && (
              <p className="text-xs italic text-muted-foreground text-center px-2 leading-relaxed animate-in fade-in duration-200">
                {t(`occasionDescription.${occasion}`)}
              </p>
            )}
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
              className="flex-1 h-12 gap-2 min-w-0 overflow-hidden"
              disabled={!occasion || loading}
              onClick={generateSuggestions}
            >
              {loading ? (
                // Inner span fills the flex-1 slot exactly — no min-w
                // forcing the button to grow when the loader cycles
                // through longer phrases. Phrase strings are kept short
                // (~13-15 chars each) so they fit naturally.
                <span className="inline-flex items-center justify-center w-full overflow-hidden">
                  <StylistLoader
                    size="sm"
                    phases={[
                      t("suggest.linetteStylingPhase1"),
                      t("suggest.linetteStylingPhase2"),
                      t("suggest.linetteStylingPhase3"),
                      t("suggest.linetteStylingPhase4"),
                      t("suggest.linetteStylingPhase5"),
                      t("suggest.linetteStylingPhase6"),
                    ]}
                  />
                </span>
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
            items={suggestions[0].items}
            reasoning={suggestions[0].reasoning}
            stylingTip={suggestions[0].styling_tip}
            name={suggestions[0].name}
            saving={saving}
            isFavorited={favoritedIndices.has(0)}
            onSave={() => saveFavorite(suggestions[0])}
            onWearToday={() => wearToday(suggestions[0])}
            onSwapItem={(item) => setSwapTargetItem(item)}
            lockedItemIds={anchorItemId ? new Set([anchorItemId]) : undefined}
            contextBadges={[
              ...(mood ? [{ label: tMood(mood, "label"), icon: MOOD_ICONS[mood] }] : []),
              ...(occasion ? [{ label: t(`occasion.${occasion}`) }] : []),
              ...styleWishes.map((wish) => ({
                label: wish,
                icon: Sparkles,
                tone: "primary" as const,
              })),
            ]}
          />

          {/* Degraded-path disclosure: the server relaxed at least one
              styling rule to avoid an empty result. Without this line a
              rule-bending outfit is indistinguishable from a validated
              one (audit P1). */}
          {suggestions[0].relaxed && (
            <p className="text-xs text-muted-foreground text-center px-4">
              {t("suggest.relaxedNotice")}
            </p>
          )}

          {/* Single-outfit mode: tap to re-generate. Variety across
              taps is enforced server-side via the recent-suggestions
              KV (already in place for anti-repetition). */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleShowAnother}
              disabled={loading}
            >
              <Sparkles className="h-4 w-4" />
              {loading ? t("suggest.styling") : t("suggest.showAnother")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartOver}
              disabled={loading}
            >
              {t("suggest.startOver")}
            </Button>
          </div>

          {/* Wardrobe gap suggestion from AI — distinct from the
              styling tip above. The AI flags missing staples here
              (e.g. "A pointed-toe pump would finish this"). */}
          {wardrobeGap && (
            <div className="mt-2 border-t border-b border-border py-3">
              <p className="editorial-label mb-1.5">{t("suggest.wardrobeGap")}</p>
              <p className="stylist-quote text-sm">{wardrobeGap}</p>
            </div>
          )}
        </div>
      )}

      {/* Regenerating with no card on screen (e.g. "Try again" after an
          error/empty result): the error card hides while loading and no
          outfit card exists yet, so without this block the tap looked
          like it did nothing for the entire regeneration (audit P1). */}
      {step === "results" && suggestions.length === 0 && loading && (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 flex justify-center">
          <StylistLoader
            phases={[
              t("suggest.linetteStylingPhase1"),
              t("suggest.linetteStylingPhase2"),
              t("suggest.linetteStylingPhase3"),
              t("suggest.linetteStylingPhase4"),
              t("suggest.linetteStylingPhase5"),
              t("suggest.linetteStylingPhase6"),
            ]}
          />
        </div>
      )}

      {/* Empty state — three distinct cases:
          1. limitError → daily cap reached, action is "wait until tomorrow"
          2. aiError → backend failure, action is "try again"
          3. else → wardrobe is genuinely thin, action is "add items" */}
      {step === "results" && suggestions.length === 0 && !loading && (
        limitError ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
            <p className="text-muted-foreground mb-2">
              {t("suggest.limitTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("suggest.limitHint")}
            </p>
          </div>
        ) : aiError ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
            <p className="text-muted-foreground mb-2">
              {t("suggest.aiErrorTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("suggest.aiErrorHint")}
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-1.5"
              onClick={handleShowAnother}
            >
              <Sparkles className="h-4 w-4" />
              {t("suggest.tryAgain")}
            </Button>
          </div>
        ) : (
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
        )
      )}

      {/* Swap modal — opens when the user taps the shuffle icon on any
          item in the current outfit. Showing alternatives in the same
          category from the user's wardrobe. */}
      <SwapItemModal
        open={swapTargetItem !== null}
        onOpenChange={(open) => {
          if (!open) setSwapTargetItem(null);
        }}
        currentItem={swapTargetItem}
        wardrobe={wardrobe}
        excludeIds={
          suggestions[0]
            ? new Set(suggestions[0].items.map((i) => i.id))
            : undefined
        }
        onSelect={applySwap}
      />
    </div>
  );
}
