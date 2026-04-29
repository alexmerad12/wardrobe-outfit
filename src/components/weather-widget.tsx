"use client";

import { useEffect, useState } from "react";
import type { WeatherData } from "@/lib/types";
import {
  Droplets,
  Droplet,
  Wind,
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudLightning,
  Snowflake,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";
import { useLocale } from "@/lib/i18n/use-locale";

// Maps the English condition strings produced by src/lib/weather.ts to the
// slug keys under "weatherCondition" in the translation files. Kept in the
// widget rather than on the server so the WeatherData payload stays simple.
const CONDITION_KEYS: Record<string, string> = {
  "Clear sky": "clearSky",
  "Mainly clear": "mainlyClear",
  "Partly cloudy": "partlyCloudy",
  "Overcast": "overcast",
  "Fog": "fog",
  "Depositing rime fog": "rimeFog",
  "Light drizzle": "lightDrizzle",
  "Moderate drizzle": "moderateDrizzle",
  "Dense drizzle": "denseDrizzle",
  "Slight rain": "slightRain",
  "Moderate rain": "moderateRain",
  "Heavy rain": "heavyRain",
  "Slight snow": "slightSnow",
  "Moderate snow": "moderateSnow",
  "Heavy snow": "heavySnow",
  "Snow grains": "snowGrains",
  "Slight rain showers": "slightRainShowers",
  "Moderate rain showers": "moderateRainShowers",
  "Violent rain showers": "violentRainShowers",
  "Slight snow showers": "slightSnowShowers",
  "Heavy snow showers": "heavySnowShowers",
  "Thunderstorm": "thunderstorm",
  "Thunderstorm with slight hail": "thunderstormSlightHail",
  "Thunderstorm with heavy hail": "thunderstormHeavyHail",
};

const COORDS_KEY = "wx:coords:v1";
const DATA_KEY_PREFIX = "wx:data:v1:";
const COORDS_TTL_MS = 60 * 60 * 1000;  // 1h — re-acquire location often enough that moving across town is reflected within the hour
const DATA_TTL_MS = 2 * 60 * 1000;  // 2min — keep temp readings close to live

type Coords = { lat: number; lng: number };

function roundCoord(n: number) {
  return Math.round(n * 100) / 100;
}

// Editorial "color mood" map — low-saturation tints that read like a
// fashion-spread color palette rather than a weather-app icon set. Each
// condition gets a monochrome Lucide icon in a muted foreground tint;
// the mood comes from the card background, not from saturated icons.
function iconForCondition(condition: string): { Icon: LucideIcon; bg: string } {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return { Icon: CloudLightning, bg: "bg-[#d8d3df]" };
  if (c.includes("snow grains") || c.includes("heavy snow"))
    return { Icon: Snowflake, bg: "bg-[#eaeef2]" };
  if (c.includes("snow")) return { Icon: CloudSnow, bg: "bg-[#eaeef2]" };
  if (c.includes("heavy rain") || c.includes("violent"))
    return { Icon: CloudRainWind, bg: "bg-[#c5d1db]" };
  if (c.includes("drizzle")) return { Icon: CloudDrizzle, bg: "bg-[#d1dae2]" };
  if (c.includes("rain") || c.includes("shower"))
    return { Icon: CloudRain, bg: "bg-[#d1dae2]" };
  if (c.includes("fog") || c.includes("rime")) return { Icon: CloudFog, bg: "bg-[#dfdedb]" };
  if (c.includes("overcast")) return { Icon: Cloud, bg: "bg-[#d8d5d0]" };
  if (c.includes("partly cloudy")) return { Icon: CloudSun, bg: "bg-[#e5e3dc]" };
  if (c.includes("clear") || c.includes("mainly clear"))
    return { Icon: Sun, bg: "bg-[#f1e8d2]" };
  return { Icon: Thermometer, bg: "bg-muted" };
}

function readCachedCoords(): Coords | null {
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; ts: number };
    if (Date.now() - parsed.ts > COORDS_TTL_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeCachedCoords(coords: Coords) {
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify({ ...coords, ts: Date.now() }));
  } catch {}
}

function readCachedData(coords: Coords): WeatherData | null {
  try {
    const key = `${DATA_KEY_PREFIX}${roundCoord(coords.lat)},${roundCoord(coords.lng)}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: WeatherData; ts: number };
    if (Date.now() - parsed.ts > DATA_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedData(coords: Coords, data: WeatherData) {
  try {
    const key = `${DATA_KEY_PREFIX}${roundCoord(coords.lat)},${roundCoord(coords.lng)}`;
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

async function fetchWeatherFromApi(coords: Coords | null): Promise<WeatherData> {
  // Passing no coords lets the server fall back to IP-based geolocation
  // so the widget can render something useful before the browser's GPS
  // prompt resolves.
  const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : "";
  const res = await fetch(`/api/weather${qs}`);
  if (!res.ok) throw new Error("Failed to fetch weather");
  return (await res.json()) as WeatherData;
}

// Editorial "mood strip" — a horizontal band whose background color carries
// the weather's emotional cue (pale gold for sun, slate for rain, bone for
// snow). Low-saturation tints so the card reads as refined, not loud.
const STRIP_BASE =
  "relative overflow-hidden rounded-xl px-5 py-3 transition-colors duration-500";

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unit = useTemperatureUnit();
  const { t } = useLocale();

  useEffect(() => {
    let cancelled = false;

    async function loadForCoords(coords: Coords) {
      const cached = readCachedData(coords);
      if (cached) {
        if (!cancelled) {
          setWeather(cached);
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchWeatherFromApi(coords);
        if (cancelled) return;
        writeCachedData(coords, data);
        setWeather(data);
        setLoading(false);
      } catch {
        if (!cancelled && !weather) setError("Couldn't fetch weather");
      }
    }

    async function loadFromIpGeo() {
      try {
        const data = await fetchWeatherFromApi(null);
        if (cancelled || weather) return;
        setWeather(data);
        setLoading(false);
      } catch {
        if (!cancelled && !weather) setError("Couldn't fetch weather");
      }
    }

    const cachedCoords = readCachedCoords();
    if (cachedCoords) {
      loadForCoords(cachedCoords);
      return () => {
        cancelled = true;
      };
    }

    loadFromIpGeo();

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          writeCachedCoords(coords);
          loadForCoords(coords);
        },
        () => {
          // Denied or unavailable — keep whatever IP-based data we got.
        }
      );
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className={`${STRIP_BASE} bg-muted animate-pulse`}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-12 w-24 rounded bg-muted-foreground/10" />
            <div className="h-3 w-32 rounded bg-muted-foreground/10" />
          </div>
          <div className="h-10 w-10 rounded-full bg-muted-foreground/10" />
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className={`${STRIP_BASE} bg-muted`}>
        <div className="flex items-center gap-3">
          <Thermometer className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("weatherWidget.enableLocation")}
          </p>
        </div>
      </div>
    );
  }

  const { Icon, bg } = iconForCondition(weather.condition);
  const conditionKey = CONDITION_KEYS[weather.condition];
  const conditionLabel = conditionKey
    ? t(`weatherCondition.${conditionKey}`)
    : weather.condition;

  return (
    <div className={`${STRIP_BASE} ${bg}`}>
      {/* Top row: hero Bodoni temp + condition label + minimal icon */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className="font-heading italic text-4xl font-medium leading-none tracking-tight text-foreground">
              {convertTemp(weather.temp, unit)}°
            </span>
            <span className="text-xs text-foreground/50">
              {unit === "fahrenheit" ? "F" : "C"}
            </span>
          </div>
          <p className="editorial-label mt-1.5 text-foreground/70">
            {conditionLabel}
          </p>
          <p className="font-heading italic text-xs text-foreground/60">
            {t("weatherWidget.feelsLike", { temp: convertTemp(weather.feels_like, unit) })}
          </p>
        </div>
        <Icon className="h-6 w-6 text-foreground/50 shrink-0 mt-1" strokeWidth={1.5} />
      </div>

      {/* Bottom row: hairline + metrics */}
      <div className="mt-2.5 flex items-center gap-5 border-t border-foreground/10 pt-2">
        {weather.precipitation_probability > 0 && (
          <div className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5 text-foreground/40" strokeWidth={1.75} />
            <span className="text-xs text-foreground/60">
              {weather.precipitation_probability}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-foreground/40" strokeWidth={1.75} />
          <span className="text-xs text-foreground/60">
            {weather.wind_speed} km/h
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplet className="h-3.5 w-3.5 text-foreground/40" strokeWidth={1.75} />
          <span className="text-xs text-foreground/60">
            {weather.humidity}%
          </span>
        </div>
      </div>
    </div>
  );
}
