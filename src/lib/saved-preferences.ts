"use client";

import { invalidatePreferences, type ClientPreferences } from "./preferences-client";
import { localeStore } from "./i18n/use-locale";
import { temperatureUnitStore } from "./use-temperature-unit";

/**
 * Call after a successful PUT /api/preferences (Settings, onboarding). Drops
 * the shared preferences cache and switches the language, the gendered
 * French wording and the temperature unit on every mounted screen right
 * away, the bottom nav included. Pass the fields that were just saved.
 */
export function applySavedPreferences(prefs: ClientPreferences): void {
  invalidatePreferences();
  localeStore.saved(prefs);
  temperatureUnitStore.saved(prefs);
}
