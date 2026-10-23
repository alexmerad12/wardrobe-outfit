import type { TemperatureUnit } from "./types";
import type { Locale } from "./i18n";

// Countries that use Fahrenheit (essentially US + a few territories)
const FAHRENHEIT_LOCALES = ["en-US", "en-PR", "en-GU", "en-VI", "en-UM", "en-AS", "en-MP", "en-BS", "en-BZ", "en-KY", "en-PW", "en-FM", "en-MH", "en-LR"];

// Country names, lowercase without accents, matched as a prefix of the last
// part of the stored location.city string ("City, Region, Country"). The
// browser's navigator.language is unreliable here: a French Canadian in
// Montreal may browse with en-US set, but still expects Celsius. English as
// Open-Meteo's search returns them; French because the device-location lookup
// (reverse-geocode.ts) answers in the user's language: "États-Unis d'Amérique".
const FAHRENHEIT_COUNTRIES = [
  "united states",
  "bahamas",
  "belize",
  "cayman islands",
  "liberia",
  "palau",
  "federated states of micronesia",
  "marshall islands",
  "etats-unis",
  "iles caimans",
  "palaos",
  "etats federes de micronesie",
  "iles marshall",
];

function countryFromCity(city: string): string | null {
  const parts = city.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || null;
}

function usesFahrenheit(country: string): boolean {
  const plain = country.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return FAHRENHEIT_COUNTRIES.some((name) => plain.startsWith(name));
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
      return usesFahrenheit(country) ? "fahrenheit" : "celsius";
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

/**
 * Format a wind speed in the unit system of the temperature. The weather API
 * returns km/h; a Fahrenheit user reads mph (the weather card showed °F next
 * to km/h). French abbreviates miles per hour "mi/h".
 */
export function formatWind(kmh: number, unit: "celsius" | "fahrenheit", locale: Locale): string {
  if (unit === "fahrenheit") return `${Math.round(kmh * 0.621371)} ${locale === "fr" ? "mi/h" : "mph"}`;
  return `${Math.round(kmh)} km/h`;
}
