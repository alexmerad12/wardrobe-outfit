"use client";

import { useEffect, useState } from "react";
import type { WeatherData } from "@/lib/types";
import { getWeather } from "@/lib/weather";
import { Droplets, Wind } from "lucide-react";
import { useTemperatureUnit } from "@/lib/use-temperature-unit";
import { convertTemp } from "@/lib/temperature";

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unit = useTemperatureUnit();

  useEffect(() => {
    async function fetchWeather() {
      try {
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const data = await getWeather(
                  position.coords.latitude,
                  position.coords.longitude
                );
                setWeather(data);
              } catch {
                setError("Couldn't fetch weather");
              } finally {
                setLoading(false);
              }
            },
            () => {
              getWeather(48.8566, 2.3522)
                .then(setWeather)
                .catch(() => setError("Couldn't fetch weather"))
                .finally(() => setLoading(false));
            }
          );
        } else {
          setLoading(false);
          setError("Location not supported");
        }
      } catch {
        setLoading(false);
        setError("Couldn't fetch weather");
      }
    }

    fetchWeather();
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
