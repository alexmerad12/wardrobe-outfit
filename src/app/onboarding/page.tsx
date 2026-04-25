"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Languages, Thermometer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { Language, Gender, TemperatureSensitivity } from "@/lib/types";
import { detectLocale, translate, type Locale } from "@/lib/i18n";

interface CityResult {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Initial language: detected (en/fr). User can switch in profile.
  // We dropped "auto" as an explicit option — it always resolves to one
  // of the two anyway, so showing both pre-resolved is clearer.
  const [language, setLanguage] = useState<Language>(detectLocale() === "fr" ? "fr" : "en");
  const [city, setCity] = useState("");
  const [cityLat, setCityLat] = useState(0);
  const [cityLng, setCityLng] = useState(0);
  const [tempSensitivity, setTempSensitivity] = useState<TemperatureSensitivity>("normal");
  // Gender defaults to "woman" since Closette is women-first. We no
  // longer ask in onboarding; users can change in profile.
  const [gender] = useState<Gender>("woman");

  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use the selected language immediately inside onboarding, even before save.
  const locale: Locale = language === "en" || language === "fr" ? language : detectLocale();
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleCityInput(value: string) {
    setCityQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length < 2) {
      setCityResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=6&language=en&format=json`
        );
        if (res.ok) {
          const data = await res.json();
          setCityResults(data.results ?? []);
          setShowDropdown(true);
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectCity(result: CityResult) {
    const label = result.admin1
      ? `${result.name}, ${result.admin1}, ${result.country}`
      : `${result.name}, ${result.country}`;
    setCity(label);
    setCityQuery(label);
    setCityLat(result.latitude);
    setCityLng(result.longitude);
    setShowDropdown(false);
  }

  const canAdvance =
    (step === 1) ||
    (step === 2 && city && cityLat !== 0) ||
    (step === 3);

  async function handleFinish() {
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: city ? { city, lat: cityLat, lng: cityLng } : null,
          language,
          gender,
          temperature_sensitivity: tempSensitivity,
        }),
      });
      try {
        window.localStorage.removeItem("locale:v1");
        window.localStorage.removeItem("gender:v1");
        window.localStorage.removeItem("tempUnit:v1");
      } catch {}
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Failed to save onboarding:", err);
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl">
            {t("onboarding.welcome")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("onboarding.welcomeSub")}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("onboarding.step", { current: step, total: TOTAL_STEPS })}
          </p>
        </div>

        <Card className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <CardContent className="space-y-4 p-5">
            {step === 1 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-medium">
                    {t("onboarding.languageTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("onboarding.languageSub")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5" />
                    {t("profile.language")}
                  </Label>
                  <Select
                    value={language}
                    onValueChange={(v) => setLanguage(v as Language)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value) => {
                          if (value === "en") return t("profile.english");
                          if (value === "fr") return t("profile.french");
                          return null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t("profile.english")}</SelectItem>
                      <SelectItem value="fr">{t("profile.french")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-medium">
                    {t("onboarding.cityTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("onboarding.citySub")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("profile.city")}
                  </Label>
                  <div className="relative" ref={dropdownRef}>
                    <Input
                      placeholder={t("profile.cityPlaceholder")}
                      value={cityQuery}
                      onChange={(e) => handleCityInput(e.target.value)}
                      onFocus={() => {
                        if (cityResults.length > 0) setShowDropdown(true);
                      }}
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {showDropdown && cityResults.length > 0 && (
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
                              {result.admin1 && (
                                <span className="text-muted-foreground">, {result.admin1}</span>
                              )}
                              <span className="text-muted-foreground">, {result.country}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {city && cityLat !== 0 && (
                    <p className="text-xs text-muted-foreground">
                      {city} ({cityLat.toFixed(2)}, {cityLng.toFixed(2)})
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-medium">
                    {t("onboarding.tempTitle")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("onboarding.tempSub")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Thermometer className="h-3.5 w-3.5" />
                    {t("profile.tempSensitivity")}
                  </Label>
                  <Select
                    value={tempSensitivity}
                    onValueChange={(v) => setTempSensitivity(v as TemperatureSensitivity)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value) => {
                          if (value === "runs-hot") return t("profile.runsHot");
                          if (value === "normal") return t("profile.normal");
                          if (value === "runs-cold") return t("profile.runsCold");
                          return null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="runs-hot">{t("profile.runsHot")}</SelectItem>
                      <SelectItem value="normal">{t("profile.normal")}</SelectItem>
                      <SelectItem value="runs-cold">{t("profile.runsCold")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(step - 1)}
                  disabled={saving}
                >
                  {t("onboarding.back")}
                </Button>
              )}
              {step < TOTAL_STEPS ? (
                <Button
                  className="flex-1"
                  onClick={() => setStep(step + 1)}
                  disabled={!canAdvance}
                >
                  {t("onboarding.next")}
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  onClick={handleFinish}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("onboarding.saving")}
                    </>
                  ) : (
                    t("onboarding.finish")
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
