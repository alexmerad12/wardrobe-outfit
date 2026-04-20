"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StylistLoader } from "@/components/stylist-loader";
import { useLocale } from "@/lib/i18n/use-locale";
import {
  ArrowLeft,
  Loader2,
  Plane,
  MapPin,
  Cloud,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Trash2,
  Check,
} from "lucide-react";

interface CityResult {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

interface PackingItem {
  item: ClothingItem;
  reason: string;
}

interface OutfitDay {
  day: string;
  items: ClothingItem[];
  note: string;
}

interface SavedTrip {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  packing_item_ids: string[];
  weather_summary: string | null;
  packing_tips: string | null;
  outfit_suggestions: { day: string; item_ids: string[]; note: string }[];
}

export default function PackingPage() {
  const router = useRouter();
  const { locale, t } = useLocale();

  // Trip dates come from Supabase as ISO strings (YYYY-MM-DD). Render them
  // in the user's locale so a French user sees "15 avr." instead of "Apr 15".
  const localeTag = locale === "fr" ? "fr-FR" : "en-US";
  function formatTripDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
    return new Date(iso + "T12:00:00").toLocaleDateString(localeTag, opts);
  }

  // Form
  const [destination, setDestination] = useState("");
  const [destLat, setDestLat] = useState(0);
  const [destLng, setDestLng] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [occasions, setOccasions] = useState("");
  const [notes, setNotes] = useState("");

  // City search
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Results
  const [loading, setLoading] = useState(false);
  const [packingList, setPackingList] = useState<PackingItem[]>([]);
  const [outfitSuggestions, setOutfitSuggestions] = useState<OutfitDay[]>([]);
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null);
  const [packingTips, setPackingTips] = useState<string | null>(null);
  const [showOutfits, setShowOutfits] = useState(false);
  const [step, setStep] = useState<"form" | "results">("form");
  const [saved, setSaved] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);

  // Saved trips
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [viewingTrip, setViewingTrip] = useState<SavedTrip | null>(null);

  useEffect(() => {
    async function loadTrips() {
      try {
        const [tripsRes, itemsRes] = await Promise.all([
          fetch("/api/trips"),
          fetch("/api/items"),
        ]);
        if (tripsRes.ok) setSavedTrips(await tripsRes.json());
        if (itemsRes.ok) setAllItems(await itemsRes.json());
      } catch {}
    }
    loadTrips();
  }, []);

  function handleDestSearch(value: string) {
    setDestination(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length < 2) {
      setCityResults([]);
      setShowCityDropdown(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=6&language=en&format=json`
        );
        if (res.ok) {
          const data = await res.json();
          setCityResults(data.results ?? []);
          setShowCityDropdown(true);
        }
      } catch {}
    }, 300);
  }

  function selectCity(result: CityResult) {
    const label = result.admin1
      ? `${result.name}, ${result.admin1}, ${result.country}`
      : `${result.name}, ${result.country}`;
    setDestination(label);
    setDestLat(result.latitude);
    setDestLng(result.longitude);
    setShowCityDropdown(false);
  }

  async function generatePackingList() {
    if (!destination || !startDate || !endDate) return;

    // If an identical trip was already saved, skip the AI call and open it.
    const existing = savedTrips.find(
      (t) =>
        t.destination === destination &&
        t.start_date === startDate &&
        t.end_date === endDate
    );
    if (existing) {
      setViewingTrip(existing);
      return;
    }

    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch("/api/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, lat: destLat, lng: destLng, startDate, endDate, occasions, notes, locale }),
      });

      if (res.ok) {
        const data = await res.json();
        setPackingList(data.packing_list ?? []);
        setOutfitSuggestions(data.outfit_suggestions ?? []);
        setWeatherSummary(data.weather_summary ?? null);
        setPackingTips(data.packing_tips ?? null);
        setStep("results");
      }
    } catch (err) {
      console.error("Failed to generate packing list:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveTrip() {
    setSavingTrip(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          lat: destLat,
          lng: destLng,
          start_date: startDate,
          end_date: endDate,
          occasions,
          notes,
          packing_item_ids: packingList.map((p) => p.item.id),
          weather_summary: weatherSummary,
          packing_tips: packingTips,
          outfit_suggestions: outfitSuggestions.map((o) => ({
            day: o.day,
            item_ids: o.items.map((i) => i.id),
            note: o.note,
          })),
        }),
      });
      if (res.ok) {
        const trip = await res.json();
        setSavedTrips((prev) => [trip, ...prev]);
        setSaved(true);
      }
    } catch (err) {
      console.error("Failed to save trip:", err);
    } finally {
      setSavingTrip(false);
    }
  }

  async function deleteTrip(id: string) {
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    setSavedTrips((prev) => prev.filter((t) => t.id !== id));
    if (viewingTrip?.id === id) setViewingTrip(null);
  }

  function openSavedTrip(trip: SavedTrip) {
    setViewingTrip(trip);
  }

  // Resolve items for a saved trip
  function resolveItems(itemIds: string[]): ClothingItem[] {
    return itemIds.map((id) => allItems.find((i) => i.id === id)).filter(Boolean) as ClothingItem[];
  }

  const upcomingTrips = savedTrips.filter((t) => new Date(t.end_date) >= new Date());
  const pastTrips = savedTrips.filter((t) => new Date(t.end_date) < new Date());

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (viewingTrip) { setViewingTrip(null); return; }
            if (step === "results") { setStep("form"); return; }
            router.back();
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {viewingTrip ? viewingTrip.destination : t("packing.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewingTrip
              ? `${formatTripDate(viewingTrip.start_date)} – ${formatTripDate(viewingTrip.end_date)}`
              : step === "form"
              ? t("packing.planTrip")
              : t("packing.itemsToPack", { count: packingList.length })}
          </p>
        </div>
      </div>

      {/* ===== VIEWING A SAVED TRIP ===== */}
      {viewingTrip && (
        <div className="space-y-5">
          {viewingTrip.weather_summary && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <Cloud className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">{viewingTrip.weather_summary}</p>
            </div>
          )}

          <div>
            <h2 className="font-semibold mb-3">{t("packing.packingListCount", { count: resolveItems(viewingTrip.packing_item_ids).length })}</h2>
            <div className="grid grid-cols-3 gap-2">
              {resolveItems(viewingTrip.packing_item_ids).map((item) => (
                <div key={item.id} className="text-center">
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-muted/30 mb-1">
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="100px" />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{item.name}</p>
                </div>
              ))}
            </div>
          </div>

          {viewingTrip.outfit_suggestions.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">{t("packing.dailyOutfits")}</h2>
              <div className="grid gap-3">
                {viewingTrip.outfit_suggestions.map((day, i) => {
                  const dayItems = resolveItems(day.item_ids);
                  return (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium mb-1">{day.day}</p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-1">
                          {dayItems.map((item) => (
                            <div key={item.id} className="relative h-14 w-14 flex-shrink-0 rounded-md overflow-hidden bg-muted/30">
                              <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{day.note}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {viewingTrip.packing_tips && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">{viewingTrip.packing_tips}</p>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full gap-1.5 text-destructive"
            onClick={() => deleteTrip(viewingTrip.id)}
          >
            <Trash2 className="h-4 w-4" />
            {t("packing.deleteTrip")}
          </Button>
        </div>
      )}

      {/* ===== FORM ===== */}
      {!viewingTrip && step === "form" && (
        <div className="space-y-5">
          {/* Destination */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {t("packing.destination")}
            </Label>
            <div className="relative" ref={dropdownRef}>
              <Input
                placeholder={t("packing.destinationPlaceholder")}
                value={destination}
                onChange={(e) => handleDestSearch(e.target.value)}
                onFocus={() => { if (cityResults.length > 0) setShowCityDropdown(true); }}
              />
              {showCityDropdown && cityResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-48 overflow-y-auto">
                  {cityResults.map((result, i) => (
                    <button
                      key={`${result.latitude}-${result.longitude}-${i}`}
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                      onClick={() => selectCity(result)}
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span>
                        <span className="font-medium">{result.name}</span>
                        {result.admin1 && <span className="text-muted-foreground">, {result.admin1}</span>}
                        <span className="text-muted-foreground">, {result.country}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("packing.from")}</Label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder={locale === "fr" ? "jj/mm/aaaa" : "mm/dd/yyyy"}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("packing.to")}</Label>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder={locale === "fr" ? "jj/mm/aaaa" : "mm/dd/yyyy"}
              />
            </div>
          </div>

          {/* Occasions */}
          <div className="space-y-2">
            <Label>{t("packing.plannedActivities")}</Label>
            <Input placeholder={t("packing.activitiesPlaceholder")} value={occasions} onChange={(e) => setOccasions(e.target.value)} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t("packing.anythingElse")}</Label>
            <Input placeholder={t("packing.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button
            className="w-full h-12 gap-2"
            onClick={generatePackingList}
            disabled={!destination || !startDate || !endDate || loading}
          >
            {loading ? (
              <StylistLoader size="sm" label={t("suggest.yavIsPacking")} />
            ) : (
              <><Plane className="h-4 w-4" /> {t("packing.generate")}</>
            )}
          </Button>

          {/* Saved trips */}
          {upcomingTrips.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">{t("packing.upcomingTrips")}</h2>
              <div className="grid gap-2">
                {upcomingTrips.map((trip) => (
                  <Card key={trip.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openSavedTrip(trip)}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{trip.destination}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTripDate(trip.start_date)}
                          {" – "}
                          {formatTripDate(trip.end_date)}
                          {" · "}
                          {trip.packing_item_ids.length} {t("packing.items")}
                        </p>
                      </div>
                      <Plane className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {pastTrips.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">{t("packing.pastTrips")}</h2>
              <div className="grid gap-2">
                {pastTrips.map((trip) => (
                  <Card key={trip.id} className="cursor-pointer hover:shadow-md transition-shadow opacity-70" onClick={() => openSavedTrip(trip)}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{trip.destination}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTripDate(trip.start_date)}
                          {" – "}
                          {formatTripDate(trip.end_date)}
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteTrip(trip.id); }} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== RESULTS ===== */}
      {!viewingTrip && step === "results" && (
        <div className="space-y-5">
          {weatherSummary && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <Cloud className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">{weatherSummary}</p>
            </div>
          )}

          <div>
            <h2 className="font-semibold mb-3">{t("packing.whatToPack")}</h2>
            <div className="grid gap-2">
              {packingList.map(({ item, reason }) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-2 flex items-center gap-3">
                    <div className="relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-muted/30">
                      <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="64px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <Badge variant="secondary" className="text-[10px] mt-0.5">{item.category}</Badge>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{reason}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {outfitSuggestions.length > 0 && (
            <div>
              <button className="flex items-center gap-2 font-semibold mb-3 w-full" onClick={() => setShowOutfits(!showOutfits)}>
                {t("packing.dailyOutfitPlan")}
                {showOutfits ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showOutfits && (
                <div className="grid gap-3">
                  {outfitSuggestions.map((day, i) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium mb-1">{day.day}</p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-1">
                          {day.items.map((item) => (
                            <div key={item.id} className="relative h-14 w-14 flex-shrink-0 rounded-md overflow-hidden bg-muted/30">
                              <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{day.note}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {packingTips && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">{packingTips}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>
              {t("packing.editTrip")}
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={saveTrip}
              disabled={saved || savingTrip}
            >
              {saved ? (
                <><Check className="h-4 w-4" /> {t("packing.savedTrip")}</>
              ) : savingTrip ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {t("packing.savingTrip")}</>
              ) : (
                <><Plane className="h-4 w-4" /> {t("packing.saveTrip")}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
