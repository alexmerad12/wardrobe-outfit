"use client";

import { useSyncExternalStore } from "react";
import { resolveUnit } from "./temperature";
import { createPreferenceStore } from "./preference-store";

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
 * The temperature unit every useTemperatureUnit() reader shares. Saving new
 * preferences goes through applySavedPreferences (src/lib/saved-preferences.ts).
 */
export const temperatureUnitStore = createPreferenceStore<"celsius" | "fahrenheit">({
  serverValue: "celsius",
  readCache: readCached,
  writeCache: writeCached,
  fromPrefs: (prefs) => resolveUnit(prefs.temperature_unit, prefs.location),
  equals: (a, b) => a === b,
});

/**
 * Client-side hook to get the resolved temperature unit (celsius or fahrenheit).
 *
 * Renders stably by caching the last-resolved unit in localStorage — avoids
 * the flash where the widget briefly shows the browser-locale guess before
 * /api/preferences resolves with the user's actual choice. SSR and
 * hydration render "celsius".
 */
export function useTemperatureUnit(): "celsius" | "fahrenheit" {
  return useSyncExternalStore(
    temperatureUnitStore.subscribe,
    temperatureUnitStore.getSnapshot,
    temperatureUnitStore.getServerSnapshot
  );
}
