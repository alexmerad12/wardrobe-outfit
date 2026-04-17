"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Plane,
  MapPin,
  Cloud,
  Lightbulb,
  ChevronDown,
  ChevronUp,
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

export default function PackingPage() {
  const router = useRouter();

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
    setLoading(true);

    try {
      const res = await fetch("/api/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          lat: destLat,
          lng: destLng,
          startDate,
          endDate,
          occasions,
          notes,
        }),
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

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (step === "results" ? setStep("form") : router.back())}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Packing List</h1>
          <p className="text-sm text-muted-foreground">
            {step === "form"
              ? "Tell me about your trip"
              : `${packingList.length} items to pack`}
          </p>
        </div>
      </div>

      {step === "form" && (
        <div className="space-y-5">
          {/* Destination */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Destination
            </Label>
            <div className="relative" ref={dropdownRef}>
              <Input
                placeholder="Where are you going?"
                value={destination}
                onChange={(e) => handleDestSearch(e.target.value)}
                onFocus={() => {
                  if (cityResults.length > 0) setShowCityDropdown(true);
                }}
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
              <Label>From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Occasions */}
          <div className="space-y-2">
            <Label>Planned activities (optional)</Label>
            <Input
              placeholder="e.g. sightseeing, dinner, beach, meetings"
              value={occasions}
              onChange={(e) => setOccasions(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Anything else? (optional)</Label>
            <Input
              placeholder="e.g. pack light, need formal outfit for wedding"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full h-12 gap-2"
            onClick={generatePackingList}
            disabled={!destination || !startDate || !endDate || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Yav is packing...
              </>
            ) : (
              <>
                <Plane className="h-4 w-4" />
                Generate Packing List
              </>
            )}
          </Button>
        </div>
      )}

      {step === "results" && (
        <div className="space-y-5">
          {/* Weather summary */}
          {weatherSummary && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <Cloud className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">{weatherSummary}</p>
            </div>
          )}

          {/* Packing list */}
          <div>
            <h2 className="font-semibold mb-3">What to pack</h2>
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

          {/* Daily outfits */}
          {outfitSuggestions.length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 font-semibold mb-3 w-full"
                onClick={() => setShowOutfits(!showOutfits)}
              >
                Daily outfit plan
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

          {/* Packing tip */}
          {packingTips && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">{packingTips}</p>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => setStep("form")}>
            Edit trip details
          </Button>
        </div>
      )}
    </div>
  );
}
