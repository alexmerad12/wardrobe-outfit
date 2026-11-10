"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_COLORS,
  THEME_OVERRIDE_ID,
  THEME_STORAGE_KEY,
  parseThemeChoice,
  resolvesToDark,
  type ThemeChoice,
} from "./theme";

// One shared value for every reader, like the language and the temperature
// unit (preference-store.ts), but with no server behind it: the choice
// lives in this browser only. The first frame is the pre-paint script's job
// (layout.tsx reads the same key); this module handles a change.

let choice: ThemeChoice | undefined; // read on first use, client only
const listeners = new Set<() => void>();

function current(): ThemeChoice {
  if (choice === undefined) {
    try {
      choice = parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      choice = "system"; // storage blocked (private window): follow the phone
    }
  }
  return choice;
}

function apply(next: ThemeChoice): void {
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = resolvesToDark(next, systemDark);
  document.documentElement.classList.toggle("dark", dark);
  // The browser bar: our own first-in-head tag for a fixed choice, none
  // for "system" (theme.ts, THEME_OVERRIDE_ID). Same as the pre-paint script.
  let override = document.getElementById(THEME_OVERRIDE_ID) as HTMLMetaElement | null;
  if (next === "system") {
    override?.remove();
    return;
  }
  if (!override) {
    override = document.createElement("meta");
    override.id = THEME_OVERRIDE_ID;
    override.name = "theme-color";
    document.head.insertBefore(override, document.head.firstChild);
  }
  override.content = THEME_COLORS[dark ? "dark" : "light"];
}

/** The person picked a look in Settings: every screen switches now. */
export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice still holds until the page is closed.
  }
  apply(next);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverChoice = (): ThemeChoice => "system";

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, current, serverChoice);
}
