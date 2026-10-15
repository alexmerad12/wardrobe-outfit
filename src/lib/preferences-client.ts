"use client";

import type { UserPreferences } from "@/lib/types";

export type ClientPreferences = Partial<UserPreferences> & {
  use_device_location?: boolean | null;
};

// ONE /api/preferences request shared by every caller on the page. The
// locale hook alone is used by ~40 components and each one fetched on mount,
// so a single navigation fired ~30 identical requests (each a billed
// function run with an auth check and a database read). Callers now share
// the in-flight request and reuse its answer for 60 s. A failed or signed-out
// answer is not kept, and invalidatePreferences() drops the cache as soon as
// the user saves settings, finishes onboarding or signs out.
const TTL_MS = 60_000;
let shared: Promise<ClientPreferences | null> | null = null;
let fetchedAt = 0;

export function getPreferences(): Promise<ClientPreferences | null> {
  if (!shared || Date.now() - fetchedAt > TTL_MS) {
    fetchedAt = Date.now();
    const request: Promise<ClientPreferences | null> = fetch("/api/preferences")
      .then((r) => (r.ok ? (r.json() as Promise<ClientPreferences | null>) : null))
      .catch(() => null)
      .then((prefs) => {
        if (!prefs && shared === request) shared = null;
        return prefs;
      });
    shared = request;
  }
  return shared;
}

export function invalidatePreferences(): void {
  shared = null;
}
