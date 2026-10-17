"use client";

import { getPreferences, type ClientPreferences } from "./preferences-client";

// One shared value per preference (the app language, the temperature unit)
// for every component that shows it, instead of a copy per component.
//
// Why: each useLocale() call (~40 components) used to keep its own copy,
// read once when the component mounted. Saving a new language in Settings
// changed nothing on screen: the page you were on and the bottom nav stayed
// in the old language until a reload (2026-10-17, known-root-causes). Now
// every reader subscribes to this store and `saved()` re-renders all of
// them at once.
//
// Reads, in order: the server render's `serverValue` (SSR and hydration),
// then the last value cached in localStorage (no flash of the wrong
// language), then the server's answer from the shared /api/preferences
// request. A server answer that was already on its way when the user saved
// is dropped, so a slow response can't switch the app back.

type Options<T> = {
  /** What the server render and hydration show. */
  serverValue: T;
  /** The last value cached in localStorage, or null. Must not throw. */
  readCache: () => T | null;
  writeCache: (value: T) => void;
  /** The value a /api/preferences answer stands for. */
  fromPrefs: (prefs: ClientPreferences) => T;
  equals: (a: T, b: T) => boolean;
  /** Side effect of the current value (e.g. <html lang>); safe to repeat. */
  apply?: (value: T) => void;
};

export type PreferenceStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  /** The user just saved these preferences: every mounted reader switches now. */
  saved: (prefs: ClientPreferences) => void;
};

export function createPreferenceStore<T>(o: Options<T>): PreferenceStore<T> {
  let value: T | undefined; // read from the cache on first use, client only
  let version = 0; // bumped by every save; drops older server answers
  const listeners = new Set<() => void>();

  const getSnapshot = (): T => {
    if (value === undefined) value = o.readCache() ?? o.serverValue;
    return value;
  };

  const set = (next: T) => {
    if (o.equals(getSnapshot(), next)) return;
    value = next;
    o.writeCache(next);
    o.apply?.(next);
    for (const listener of [...listeners]) listener();
  };

  const refreshFromServer = () => {
    const asked = version;
    getPreferences()
      .then((prefs) => {
        if (prefs && asked === version) set(o.fromPrefs(prefs));
      })
      .catch(() => {});
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      o.apply?.(getSnapshot());
      // One shared request per page (preferences-client), however many
      // readers mount.
      refreshFromServer();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot,
    getServerSnapshot: () => o.serverValue,
    saved(prefs) {
      version++;
      set(o.fromPrefs(prefs));
    },
  };
}
