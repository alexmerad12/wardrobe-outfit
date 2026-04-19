"use client";

import { useEffect, useState } from "react";
import type { WeatherData } from "@/lib/types";
import { Droplets, Wind } from "lucide-react";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";

const COORDS_KEY = "wx:coords:v1";
const DATA_KEY_PREFIX = "wx:data:v1:";
const COORDS_TTL_MS = 24 * 60 * 60 * 1000;
const DATA_TTL_MS = 15 * 60 * 1000;

type Coords = { lat: number; lng: number };

function roundCoord(n: number) {
  return Math.round(n * 100) / 100;
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

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unit = useTemperatureUnit();

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
        // Swallow — an earlier IP-based load may already have populated the
        // widget. Only surface an error if we have nothing to show.
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
      // Fast path: we already know the user's precise location.
      loadForCoords(cachedCoords);
      return () => {
        cancelled = true;
      };
    }

    // First visit: render IP-based weather immediately, then upgrade to
    // precise GPS coords once the user grants permission.
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
      <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-10 w-24 rounded-lg bg-blue-100/80" />
            <div className="h-4 w-32 rounded bg-blue-100/60" />
          </div>
          <div className="h-14 w-14 rounded-full bg-blue-100/80" />
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-100 p-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🌡️</span>
          <p className="text-sm text-muted-foreground">
            Enable location for weather-based suggestions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 p-5 shadow-sm">
      {/* Top row: temp + icon */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-3xl font-medium tracking-tight leading-none">
              {convertTemp(weather.temp, unit)}°
            </span>
            <span className="text-sm text-muted-foreground">
              {unit === "fahrenheit" ? "F" : "C"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Feels like {convertTemp(weather.feels_like, unit)}°
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-4xl leading-none">{weather.icon}</span>
          <span className="text-xs font-medium text-muted-foreground text-center max-w-[80px]">
            {weather.condition}
          </span>
        </div>
      </div>

      {/* Bottom row: details */}
      <div className="flex items-center gap-4 pt-3 border-t border-blue-100/60">
        {weather.precipitation_probability > 0 && (
          <div className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs text-muted-foreground">
              {weather.precipitation_probability}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs text-muted-foreground">
            {weather.wind_speed} km/h
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-blue-400">💧</span>
          <span className="text-xs text-muted-foreground">
            {weather.humidity}%
          </span>
        </div>
      </div>
    </div>
  );
}
