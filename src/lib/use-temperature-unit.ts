"use client";

import { useEffect, useState } from "react";
import { resolveUnit } from "./temperature";
import type { TemperatureUnit } from "./types";
import { useClientValue } from "./use-client-value";

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
  // SSR and hydration render "celsius"; the cached value applies right
  // after on the client, then the server's answer once it arrives.
  const cached = useClientValue(readCached, null);
  const [fetched, setFetched] = useState<"celsius" | "fahrenheit" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (prefs: {
          temperature_unit?: TemperatureUnit;
          location?: { city?: string | null } | null;
        } | null) => {
          if (cancelled) return;
          const resolved = resolveUnit(prefs?.temperature_unit, prefs?.location);
          writeCached(resolved);
          setFetched(resolved);
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return fetched ?? cached ?? "celsius";
}
