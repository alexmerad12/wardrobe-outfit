import { translate } from "@/lib/i18n";

/**
 * Text that is on screen before the app's code runs (the bottom nav, the
 * launch splash) carries both languages, and CSS in globals.css shows the
 * one named by <html data-locale>: a script in layout.tsx sets it before the
 * first paint and the locale store keeps it in sync after. Server-drawn text
 * is English, so a French phone saw "Home" and "Your AI Stylist" until the
 * code loaded: 0.1 s on the nav, 0.7-3 s on the splash (design review,
 * 2026-10-23). Everything drawn after the code loads uses t().
 */
export function BothLanguages({ k }: { k: string }) {
  return (
    <>
      <span className="lang-en">{translate("en", k)}</span>
      <span className="lang-fr">{translate("fr", k)}</span>
    </>
  );
}
