"use client";

import { useEffect, useState } from "react";
import { resolveUnit } from "./temperature";
import type { TemperatureUnit } from "./types";

/**
 * Client-side hook to get the resolved temperature unit (celsius or fahrenheit).
 * Reads from user preferences, falls back to browser locale.
 */
export function useTemperatureUnit(): "celsius" | "fahrenheit" {
  const [unit, setUnit] = useState<"celsius" | "fahrenheit">(() =>
    resolveUnit("auto")
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: { temperature_unit?: TemperatureUnit } | null) => {
        if (cancelled) return;
        setUnit(resolveUnit(prefs?.temperature_unit));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return unit;
}
