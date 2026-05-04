// Locale-aware relative date formatting using the platform's
// Intl.RelativeTimeFormat. Picks the largest unit that reads
// naturally — within a week we report days ("3 days ago" or
// "yesterday"), then weeks, then months, then years. With
// numeric:"auto" the output collapses to "today", "yesterday",
// "last week", etc. where the locale supports it.

import type { Locale } from "@/lib/i18n/index";

export function formatLastWorn(dateInput: string | Date, locale: Locale): string {
  // Postgres date columns serialize as "YYYY-MM-DD". new Date("YYYY-MM-DD")
  // parses as UTC midnight, which becomes the previous day in any timezone
  // west of UTC — turning yesterday into "two days ago". Anchor bare date
  // strings to local noon so the calendar-day math is timezone-stable.
  let then: Date;
  if (typeof dateInput === "string") {
    then = /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? new Date(dateInput + "T12:00:00")
      : new Date(dateInput);
  } else {
    then = dateInput;
  }
  const now = new Date();

  // Strip time so "today" / "yesterday" don't depend on hour-of-day.
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (thenDay.getTime() - nowDay.getTime()) / 86_400_000
  );

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffDays);

  if (abs < 7) return rtf.format(diffDays, "day");
  if (abs < 30) return rtf.format(Math.round(diffDays / 7), "week");
  if (abs < 365) return rtf.format(Math.round(diffDays / 30), "month");
  return rtf.format(Math.round(diffDays / 365), "year");
}
