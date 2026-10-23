"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Gender, Mood } from "@/lib/types";
import { detectLocale, resolveLocale, translate, type Locale } from "./index";
import { createPreferenceStore } from "@/lib/preference-store";

const CACHE_KEY = "locale:v1";
const GENDER_CACHE_KEY = "gender:v1";

type LocaleState = { locale: Locale; gender: Gender };

function readCached(): Locale | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw === "en" || raw === "fr" ? raw : null;
  } catch {
    return null;
  }
}

function readCachedGender(): Gender {
  try {
    const raw = window.localStorage.getItem(GENDER_CACHE_KEY);
    return raw === "woman" || raw === "man" || raw === "not-specified" ? raw : "not-specified";
  } catch {
    return "not-specified";
  }
}

const asGender = (g: unknown): Gender => (g === "woman" || g === "man" ? g : "not-specified");

/**
 * The language and gender every useLocale() reader shares. Saving new
 * preferences goes through applySavedPreferences (src/lib/saved-preferences.ts),
 * which switches every mounted screen at once.
 */
export const localeStore = createPreferenceStore<LocaleState>({
  serverValue: { locale: "en", gender: "not-specified" },
  // Nothing cached (a first visit, or signed out, where no server answer
  // ever comes): the browser's language. A hard-coded "en" here showed
  // French browsers the login and sign-up pages in English (2026-10-23).
  readCache: () =>
    typeof window === "undefined"
      ? null
      : { locale: readCached() ?? detectLocale(), gender: readCachedGender() },
  writeCache: ({ locale, gender }) => {
    try {
      window.localStorage.setItem(CACHE_KEY, locale);
      window.localStorage.setItem(GENDER_CACHE_KEY, gender);
    } catch {}
  },
  fromPrefs: (prefs) => ({ locale: resolveLocale(prefs.language), gender: asGender(prefs.gender) }),
  equals: (a, b) => a.locale === b.locale && a.gender === b.gender,
  // Keep the document language in sync — <html> stayed lang="en" while
  // the UI rendered French, so screen readers announced French content
  // with English pronunciation (audit a11y P3).
  apply: ({ locale }) => {
    try {
      document.documentElement.lang = locale;
    } catch {}
  },
});

/**
 * Client-side hook to get the resolved locale (en or fr) and a translation function.
 *
 * Renders stably by caching the last-resolved locale in localStorage — avoids
 * the flash where the UI briefly shows the browser-locale guess before
 * /api/preferences resolves with the user's actual choice.
 *
 * Also tracks gender so that French labels can switch to masculine variants
 * (mood_m.*) when the user is a man. Falls back to the default mood.* keys
 * for everyone else.
 */
export function useLocale() {
  const { locale, gender } = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const tMood = useCallback(
    (mood: Mood, field: "label" | "description") => {
      if (locale === "fr" && gender === "man") {
        const masc = translate("fr", `mood_m.${mood}.${field}`);
        // translate() never returns the full key path when missing — it
        // returns the LAST segment ("label" or "description"). Check
        // against that instead of the full path, otherwise the missing
        // mood_m entries (energized, playful, cozy, period, sad) leak
        // the literal word "label" into the UI for male users.
        if (masc !== field) return masc;
      }
      return translate(locale, `mood.${mood}.${field}`);
    },
    [locale, gender]
  );

  return { locale, gender, t, tMood };
}
