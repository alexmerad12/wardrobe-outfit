import type { Language } from "@/lib/types";
import en from "./translations/en.json";
import fr from "./translations/fr.json";

export type Locale = "en" | "fr";

export const LOCALES: Record<Locale, typeof en> = { en, fr };

/**
 * Detect the user's preferred locale from browser language.
 * Returns "fr" for French-speaking locales, "en" for everything else.
 */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || navigator.languages?.[0] || "en").toLowerCase();
  if (lang.startsWith("fr")) return "fr";
  return "en";
}

/**
 * Resolve the actual locale to use - "auto" falls back to browser detection.
 */
export function resolveLocale(pref: Language | null | undefined): Locale {
  if (pref === "en" || pref === "fr") return pref;
  return detectLocale();
}

/**
 * Human-readable name of a locale (for AI prompts etc.).
 */
export function localeName(locale: Locale): string {
  return locale === "fr" ? "French" : "English";
}

type NestedValue = string | { [key: string]: NestedValue };

function lookup(obj: NestedValue, path: string): string {
  const keys = path.split(".");
  let current: NestedValue = obj;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return path;
    current = current[key];
    if (current === undefined) return path;
  }
  return typeof current === "string" ? current : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

/**
 * Get a translation string for the given locale and key.
 * Falls back to English if the key is missing in the selected locale,
 * and to the key's last segment if missing in English too — so a stale
 * `t("color.SomethingWeird")` shows "SomethingWeird" instead of the
 * raw "color.SomethingWeird" path.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = LOCALES[locale] as NestedValue;
  const value = lookup(dict, key);
  if (value !== key) return interpolate(value, vars);

  if (locale !== "en") {
    const fallback = lookup(LOCALES.en as NestedValue, key);
    if (fallback !== key) return interpolate(fallback, vars);
  }

  // Final fallback: return just the last segment so the user sees a
  // human-ish word instead of the dotted key.
  const segments = key.split(".");
  return interpolate(segments[segments.length - 1], vars);
}
