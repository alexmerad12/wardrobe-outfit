// How the app looks on THIS device: follow the phone ("system"), or always
// light, or always dark (the owner's ask, 2026-11-09: his phone was in dark
// mode and the app gave him no way back to light).
//
// Kept in localStorage, not in the account: a phone and a laptop can
// differ, and the pre-paint script in layout.tsx has to read it before the
// first frame, before any request could answer. No "use client" here on
// purpose: layout.tsx (a server component) writes these constants into that
// script. The store and the hook live in use-theme.ts.
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme:v1";

// The page background in each mode (--background in globals.css), which
// the browser bar takes through <meta name="theme-color">.
export const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" } as const;

// With a fixed choice the browser bar must not follow the phone. Next's two
// theme-color tags (one per phone mode) are React's: changing their content
// before hydration made React add a third. So a fixed choice puts ONE tag
// of our own first in <head> (the first matching tag wins), and "system"
// removes it.
export const THEME_OVERRIDE_ID = "theme-color-override";

// Only "light" and "dark" are ever stored: anything else follows the phone.
export function parseThemeChoice(raw: string | null | undefined): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolvesToDark(choice: ThemeChoice, systemDark: boolean): boolean {
  return choice === "dark" || (choice === "system" && systemDark);
}
