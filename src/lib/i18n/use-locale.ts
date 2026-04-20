"use client";

import { useEffect, useState, useCallback } from "react";
import type { Language, Gender, Mood } from "@/lib/types";
import { resolveLocale, translate, type Locale } from "./index";

const CACHE_KEY = "locale:v1";
const GENDER_CACHE_KEY = "gender:v1";

function readCached(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw === "en" || raw === "fr" ? raw : null;
  } catch {
    return null;
  }
}

function writeCached(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, locale);
  } catch {}
}

function readCachedGender(): Gender {
  if (typeof window === "undefined") return "not-specified";
  try {
    const raw = window.localStorage.getItem(GENDER_CACHE_KEY);
    return raw === "woman" || raw === "man" || raw === "not-specified" ? raw : "not-specified";
  } catch {
    return "not-specified";
  }
}

function writeCachedGender(gender: Gender) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GENDER_CACHE_KEY, gender);
  } catch {}
}

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
  const [locale, setLocale] = useState<Locale>("en");
  const [gender, setGender] = useState<Gender>("not-specified");

  useEffect(() => {
    const cached = readCached();
    if (cached) setLocale(cached);
    setGender(readCachedGender());

    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: { language?: Language; gender?: Gender } | null) => {
        if (cancelled) return;
        const resolved = resolveLocale(prefs?.language);
        setLocale(resolved);
        writeCached(resolved);
        const g: Gender =
          prefs?.gender === "woman" || prefs?.gender === "man" ? prefs.gender : "not-specified";
        setGender(g);
        writeCachedGender(g);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const tMood = useCallback(
    (mood: Mood, field: "label" | "description") => {
      if (locale === "fr" && gender === "man") {
        const masc = translate("fr", `mood_m.${mood}.${field}`);
        if (masc !== `mood_m.${mood}.${field}`) return masc;
      }
      return translate(locale, `mood.${mood}.${field}`);
    },
    [locale, gender]
  );

  return { locale, gender, t, tMood };
}
