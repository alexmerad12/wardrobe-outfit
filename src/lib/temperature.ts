import type { TemperatureUnit } from "./types";

// Countries that use Fahrenheit (essentially US + a few territories)
const FAHRENHEIT_LOCALES = ["en-US", "en-PR", "en-GU", "en-VI", "en-UM", "en-AS", "en-MP", "en-BS", "en-BZ", "en-KY", "en-PW", "en-FM", "en-MH", "en-LR"];

// Country names as returned by Open-Meteo geocoding, used to match the stored
// location.city string ("City, Region, Country"). The browser's navigator.language
// is unreliable here: a French Canadian in Montreal may browse with en-US set,
// but still expects Celsius.
const FAHRENHEIT_COUNTRIES = [
  "United States",
  "Bahamas",
  "Belize",
  "Cayman Islands",
  "Liberia",
  "Palau",
  "Federated States of Micronesia",
  "Marshall Islands",
];

function countryFromCity(city: string): string | null {
  const parts = city.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || null;
}

/**
 * Detect the user's preferred unit from browser locale.
 * Returns "fahrenheit" for US-style locales, "celsius" for everything else.
 */
export function detectTemperatureUnit(): "celsius" | "fahrenheit" {
  if (typeof navigator === "undefined") return "celsius";
  const locale = navigator.language || navigator.languages?.[0] || "en-US";
  return FAHRENHEIT_LOCALES.some((l) => locale.startsWith(l)) ? "fahrenheit" : "celsius";
}

/**
 * Resolve the actual unit to use. "auto" prefers the user's saved location
 * country (most reliable signal), then falls back to browser-locale detection.
 */
export function resolveUnit(
  pref: TemperatureUnit | null | undefined,
  location?: { city?: string | null } | null
): "celsius" | "fahrenheit" {
  if (pref === "celsius" || pref === "fahrenheit") return pref;
  if (location?.city) {
    const country = countryFromCity(location.city);
    if (country) {
      return FAHRENHEIT_COUNTRIES.includes(country) ? "fahrenheit" : "celsius";
    }
  }
  return detectTemperatureUnit();
}

/**
 * Convert Celsius to the target unit. Weather API returns Celsius.
 */
export function convertTemp(celsius: number, unit: "celsius" | "fahrenheit"): number {
  if (unit === "fahrenheit") return Math.round((celsius * 9) / 5 + 32);
  return Math.round(celsius);
}

/**
 * Format a temperature with unit symbol.
 */
export function formatTemp(celsius: number, unit: "celsius" | "fahrenheit"): string {
  return `${convertTemp(celsius, unit)}°${unit === "fahrenheit" ? "F" : "C"}`;
}
