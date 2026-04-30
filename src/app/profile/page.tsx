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
import type { TemperatureSensitivity, TemperatureUnit, Language, Gender, ClothingItem, Category } from "@/lib/types";
import { MapPin, Thermometer, Loader2, Languages, LogOut, User, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InstallPrompt } from "@/components/install-prompt";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { colorFamily, colorFamilySwatch, type ColorFamilyKey } from "@/lib/color-family";

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
  const [gender, setGender] = useState<Gender>("not-specified");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        const [prefsRes, itemsRes, outfitsRes, logsRes] = await Promise.all([
          fetch("/api/preferences"),
          fetch("/api/items"),
          fetch("/api/outfits"),
          fetch("/api/logs"),
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
            setGender(prefs.gender ?? "not-specified");
          }
        }

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
      } finally {
        setLoading(false);
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
          gender,
          preferred_styles: [],
          favorite_colors: [],
          avoided_colors: [],
        }),
      });
      // Clear cached locale/unit/gender so the change takes effect immediately on next render
      try {
        window.localStorage.removeItem("locale:v1");
        window.localStorage.removeItem("tempUnit:v1");
        window.localStorage.removeItem("gender:v1");
      } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="font-heading text-3xl font-medium tracking-tight mb-6">{t("profile.title")}</h1>

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
                          className="object-contain p-0.5"
                          sizes="40px"
                        />
                      </div>
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      {/* Raw times-worn count hidden — the list is
                          already ordered by wear count, so position in
                          the list IS the rank. Removing the count keeps
                          the layout consistent with the item detail
                          page (counter hidden but data still drives
                          suggest-engine variety scoring). */}
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
        {loading ? (
          <CardContent className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-9 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            ))}
          </CardContent>
        ) : (
        <CardContent className="space-y-4 animate-in fade-in duration-300">
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
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    if (value === "auto") return t("profile.tempAuto");
                    if (value === "celsius") return t("profile.celsius");
                    if (value === "fahrenheit") return t("profile.fahrenheit");
                    return null;
                  }}
                </SelectValue>
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
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    if (value === "auto") return t("profile.autoLang");
                    if (value === "en") return t("profile.english");
                    if (value === "fr") return t("profile.french");
                    return null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("profile.autoLang")}</SelectItem>
                <SelectItem value="en">{t("profile.english")}</SelectItem>
                <SelectItem value="fr">{t("profile.french")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {t("profile.gender")}
            </Label>
            <Select
              value={gender}
              onValueChange={(v) => setGender(v as Gender)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    if (value === "woman") return t("profile.woman");
                    if (value === "man") return t("profile.man");
                    if (value === "not-specified") return t("profile.notSpecified");
                    return null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="woman">{t("profile.woman")}</SelectItem>
                <SelectItem value="man">{t("profile.man")}</SelectItem>
                <SelectItem value="not-specified">{t("profile.notSpecified")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : saved ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                {t("profile.settingsSaved")}
              </>
            ) : (
              t("profile.saveSettings")
            )}
          </Button>
        </CardContent>
        )}
      </Card>

      <InstallPrompt />

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {userEmail && (
            <div className="text-sm">
              <p className="text-muted-foreground">{t("profile.signedInAs")}</p>
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
