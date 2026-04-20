"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { TemperatureSensitivity, TemperatureUnit, Language, ClothingItem, Category } from "@/lib/types";
import { MapPin, Thermometer, Loader2, Languages, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InstallPrompt } from "@/components/install-prompt";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";

interface CityResult {
  name: string;
  country: string;
  admin1?: string; // state/region
  latitude: number;
  longitude: number;
}

export default function ProfilePage() {
  const { t } = useLocale();
  const labels = useLabels();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [city, setCity] = useState("");
  const [cityLat, setCityLat] = useState(0);
  const [cityLng, setCityLng] = useState(0);
  const [tempSensitivity, setTempSensitivity] =
    useState<TemperatureSensitivity>("normal");
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>("auto");
  const [language, setLanguage] = useState<Language>("auto");
  const [saving, setSaving] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [outfitCount, setOutfitCount] = useState(0);
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);

  // City search
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        const [prefsRes, itemsRes, outfitsRes] = await Promise.all([
          fetch("/api/preferences"),
          fetch("/api/items"),
          fetch("/api/outfits"),
        ]);

        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (prefs) {
            setCity(prefs.location?.city ?? "");
            setCityQuery(prefs.location?.city ?? "");
            setCityLat(prefs.location?.lat ?? 0);
            setCityLng(prefs.location?.lng ?? 0);
            setTempSensitivity(prefs.temperature_sensitivity ?? "normal");
            setTempUnit(prefs.temperature_unit ?? "auto");
            setLanguage(prefs.language ?? "auto");
          }
        }

        if (itemsRes.ok) {
          const items = await itemsRes.json();
          setItemCount(items.length);
          setAllItems(items);
        }

        if (outfitsRes.ok) {
          const outfits = await outfitsRes.json();
          setOutfitCount(outfits.length);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }
    loadProfile();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ---------- Computed stats ----------

  const colorDistribution = useMemo(() => {
    const counts: Record<string, { name: string; hex: string; count: number }> = {};
    for (const item of allItems) {
      for (const color of item.colors ?? []) {
        const key = color.name.toLowerCase();
        if (!counts[key]) {
          counts[key] = { name: color.name, hex: color.hex, count: 0 };
        }
        counts[key].count++;
      }
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
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

  const leastWornItems = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return allItems
      .filter((item) => {
        if (item.times_worn !== 0) return false;
        const created = new Date(item.created_at);
        return created < sevenDaysAgo;
      })
      .slice(0, 3);
  }, [allItems]);

  const maxColorCount = colorDistribution.length > 0 ? colorDistribution[0].count : 1;
  const maxCategoryCount = categoryBreakdown.length > 0 ? categoryBreakdown[0].count : 1;

  // ---------- Handlers ----------

  function handleCityInput(value: string) {
    setCityQuery(value);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setCityResults([]);
      setShowDropdown(false);
      return;
    }

    // Debounce 300ms
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

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          location: city
            ? { city, lat: cityLat, lng: cityLng }
            : null,
          temperature_sensitivity: tempSensitivity,
          temperature_unit: tempUnit,
          language,
          preferred_styles: [],
          favorite_colors: [],
          avoided_colors: [],
        }),
      });
      // Clear cached locale/unit so the change takes effect immediately on next render
      try {
        window.localStorage.removeItem("locale:v1");
        window.localStorage.removeItem("tempUnit:v1");
      } catch {}
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("profile.title")}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{itemCount}</p>
            <p className="text-sm text-muted-foreground">{t("profile.wardrobeItems")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{outfitCount}</p>
            <p className="text-sm text-muted-foreground">{t("profile.savedOutfits")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Wardrobe Insights */}
      {allItems.length > 0 && (
        <Card className="mb-6">
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
                    <div key={color.name} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0 border border-border"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm w-20 truncate">{color.name}</span>
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

            {/* Most Worn Items */}
            {mostWornItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("profile.mostWorn")}</p>
                <div className="space-y-2">
                  {mostWornItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="relative h-10 w-10 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                        <Image
                          src={item.thumbnail_url ?? item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {t("profile.worn", { count: item.times_worn })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mostWornItems.length > 0 && leastWornItems.length > 0 && <Separator />}

            {/* Least Worn Items */}
            {leastWornItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("profile.forgottenPieces")}</p>
                <div className="space-y-2">
                  {leastWornItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="relative h-10 w-10 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                        <Image
                          src={item.thumbnail_url ?? item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {t("profile.neverWorn")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.settings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location */}
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

          <Separator />

          {/* Temperature sensitivity */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" />
              {t("profile.tempSensitivity")}
            </Label>
            <Select
              value={tempSensitivity}
              onValueChange={(v) =>
                setTempSensitivity(v as TemperatureSensitivity)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="runs-hot">{t("profile.runsHot")}</SelectItem>
                <SelectItem value="normal">{t("profile.normal")}</SelectItem>
                <SelectItem value="runs-cold">{t("profile.runsCold")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Temperature unit */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" />
              {t("profile.tempUnit")}
            </Label>
            <Select
              value={tempUnit}
              onValueChange={(v) => setTempUnit(v as TemperatureUnit)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("profile.tempAuto")}</SelectItem>
                <SelectItem value="celsius">{t("profile.celsius")}</SelectItem>
                <SelectItem value="fahrenheit">{t("profile.fahrenheit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5" />
              {t("profile.language")}
            </Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as Language)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("profile.autoLang")}</SelectItem>
                <SelectItem value="en">{t("profile.english")}</SelectItem>
                <SelectItem value="fr">{t("profile.french")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("profile.saveSettings")
            )}
          </Button>
        </CardContent>
      </Card>

      <InstallPrompt />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {userEmail && (
            <div className="text-sm">
              <p className="text-muted-foreground">Signed in as</p>
              <p className="font-medium break-all">{userEmail}</p>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("profile.signingOut")}
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                {t("profile.signOut")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
