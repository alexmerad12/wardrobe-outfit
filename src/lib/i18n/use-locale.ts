"use client";

import { useEffect, useState, useCallback } from "react";
import type { Language } from "@/lib/types";
import { resolveLocale, translate, type Locale } from "./index";

const CACHE_KEY = "locale:v1";

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

/**
 * Client-side hook to get the resolved locale (en or fr) and a translation function.
 *
 * Renders stably by caching the last-resolved locale in localStorage — avoids
 * the flash where the UI briefly shows the browser-locale guess before
 * /api/preferences resolves with the user's actual choice.
 */
export function useLocale() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const cached = readCached();
    if (cached) setLocale(cached);

    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: { language?: Language } | null) => {
        if (cancelled) return;
        const resolved = resolveLocale(prefs?.language);
        setLocale(resolved);
        writeCached(resolved);
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

  return { locale, t };
}
