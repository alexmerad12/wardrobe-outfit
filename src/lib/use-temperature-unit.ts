"use client";

import { useEffect, useState } from "react";
import { resolveUnit } from "./temperature";
import type { TemperatureUnit } from "./types";

const CACHE_KEY = "tempUnit:v1";

function readCached(): "celsius" | "fahrenheit" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw === "celsius" || raw === "fahrenheit" ? raw : null;
  } catch {
    return null;
  }
}

function writeCached(unit: "celsius" | "fahrenheit") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, unit);
  } catch {}
}

/**
 * Client-side hook to get the resolved temperature unit (celsius or fahrenheit).
 *
 * Renders stably by caching the last-resolved unit in localStorage — avoids
 * the flash where the widget briefly shows the browser-locale guess before
 * /api/preferences resolves with the user's actual choice.
 */
export function useTemperatureUnit(): "celsius" | "fahrenheit" {
  // Deterministic initial so SSR and hydration agree. The real value is
  // applied synchronously from localStorage in the effect below.
  const [unit, setUnit] = useState<"celsius" | "fahrenheit">("celsius");

  useEffect(() => {
    const cached = readCached();
    if (cached) setUnit(cached);

    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: { temperature_unit?: TemperatureUnit } | null) => {
        if (cancelled) return;
        const resolved = resolveUnit(prefs?.temperature_unit);
        setUnit(resolved);
        writeCached(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return unit;
}
