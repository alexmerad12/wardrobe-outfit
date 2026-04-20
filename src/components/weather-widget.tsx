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
const COORDS_TTL_MS = 24 * 60 * 60 * 1000;
const DATA_TTL_MS = 15 * 60 * 1000;

type Coords = { lat: number; lng: number };

function roundCoord(n: number) {
  return Math.round(n * 100) / 100;
}

// Map Open-Meteo condition strings (see src/lib/weather.ts) to a Lucide icon,
// icon tint, and ambient-blob tint. The ambient color sits behind the frosted
// glass so the blur has something to soften — sunny days feel warm, rainy
// days feel cool, without drenching the card in color.
function iconForCondition(condition: string): {
  Icon: LucideIcon;
  tint: string;
  ambient: string;
} {
  const c = condition.toLowerCase();
  if (c.includes("thunder"))
    return { Icon: CloudLightning, tint: "text-violet-500", ambient: "bg-violet-300" };
  if (c.includes("snow grains") || c.includes("heavy snow"))
    return { Icon: Snowflake, tint: "text-sky-400", ambient: "bg-sky-200" };
  if (c.includes("snow"))
    return { Icon: CloudSnow, tint: "text-sky-400", ambient: "bg-sky-200" };
  if (c.includes("heavy rain") || c.includes("violent"))
    return { Icon: CloudRainWind, tint: "text-blue-500", ambient: "bg-blue-300" };
  if (c.includes("drizzle"))
    return { Icon: CloudDrizzle, tint: "text-blue-400", ambient: "bg-blue-200" };
  if (c.includes("rain") || c.includes("shower"))
    return { Icon: CloudRain, tint: "text-blue-500", ambient: "bg-blue-300" };
  if (c.includes("fog") || c.includes("rime"))
    return { Icon: CloudFog, tint: "text-slate-400", ambient: "bg-slate-300" };
  if (c.includes("overcast"))
    return { Icon: Cloud, tint: "text-slate-400", ambient: "bg-slate-300" };
  if (c.includes("partly cloudy"))
    return { Icon: CloudSun, tint: "text-amber-400", ambient: "bg-amber-200" };
  if (c.includes("clear") || c.includes("mainly clear"))
    return { Icon: Sun, tint: "text-amber-400", ambient: "bg-amber-200" };
  return { Icon: Thermometer, tint: "text-muted-foreground", ambient: "bg-slate-200" };
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

// Frosted-glass card: thick semi-transparent fill that reveals whatever is
// underneath (the page background, adjacent cards as you scroll) through a
// heavy backdrop blur. The inner white highlight + soft drop shadow give it
// a sense of physical depth — feels like a small tile you could pick up.
const GLASS_CLASSES =
  "relative overflow-hidden rounded-2xl p-5 " +
  "bg-white/55 backdrop-blur-2xl backdrop-saturate-150 " +
  "ring-1 ring-white/70 " +
  "shadow-[0_10px_28px_-8px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.8)]";

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
      <div className={`${GLASS_CLASSES} animate-pulse`}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-10 w-24 rounded-lg bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
          <div className="h-14 w-14 rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className={GLASS_CLASSES}>
        <div className="flex items-center gap-3">
          <Thermometer className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("weatherWidget.enableLocation")}
          </p>
        </div>
      </div>
    );
  }

  const { Icon, tint, ambient } = iconForCondition(weather.condition);
  const conditionKey = CONDITION_KEYS[weather.condition];
  const conditionLabel = conditionKey
    ? t(`weatherCondition.${conditionKey}`)
    : weather.condition;

  return (
    <div className="relative">
      {/* Ambient weather-tinted blobs — live behind the glass so the frost
          has something to soften. Tinted by condition (warm for sun, cool
          for rain/snow) but heavily blurred and low-opacity so they only
          read as atmosphere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <div
          className={`absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-60 blur-3xl ${ambient}`}
        />
        <div
          className={`absolute -bottom-8 -left-6 h-28 w-28 rounded-full opacity-40 blur-3xl ${ambient}`}
        />
      </div>

    <div className={`relative ${GLASS_CLASSES}`}>
      {/* Top row: temp + icon */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-3xl font-medium tracking-tight leading-none">
              {convertTemp(weather.temp, unit)}°
            </span>
            <span className="text-sm text-muted-foreground">
              {unit === "fahrenheit" ? "F" : "C"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("weatherWidget.feelsLike", { temp: convertTemp(weather.feels_like, unit) })}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Icon className={`h-9 w-9 ${tint}`} strokeWidth={1.75} />
          <span className="max-w-[90px] text-center text-xs font-medium text-muted-foreground">
            {conditionLabel}
          </span>
        </div>
      </div>

      {/* Bottom row: details */}
      <div className="flex items-center gap-4 border-t border-white/60 pt-3">
        {weather.precipitation_probability > 0 && (
          <div className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">
              {weather.precipitation_probability}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-sky-500" />
          <span className="text-xs text-muted-foreground">
            {weather.wind_speed} km/h
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplet className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs text-muted-foreground">
            {weather.humidity}%
          </span>
        </div>
      </div>
    </div>
    </div>
  );
}
