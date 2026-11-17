// The fixed notes the suggest route adds after the stylist's tip: the tights
// reminder (cold day, legs showing) and the "light for the weather" warning
// (an outfit let through below the warmth floor). At most one of them talks
// about tights: an outfit that was both read "Layer opaque tights underneath
// for warmth. This piece runs light for the weather — pair with thick tights
// and a warm coat." On a cold day 5 of 8 sample tips carried these lines,
// which is much of why every tip sounded the same (the owner, 2026-11-16).

export type TipLocale = "en" | "fr";

export const TIGHTS_NOTE: Record<TipLocale, string> = {
  en: "Layer opaque tights underneath for warmth.",
  fr: "Ajoute des collants opaques pour tenir le froid.",
};

export function lightForWeatherNote(locale: TipLocale, showsLegs: boolean): string {
  if (locale === "fr") {
    return showsLegs
      ? "Cette pièce est légère pour le temps : ajoute des collants épais et un manteau chaud."
      : "Cette pièce est légère pour le temps : ajoute une couche chaude et un manteau.";
  }
  return showsLegs
    ? "This piece runs light for the weather: pair it with thick tights and a warm coat."
    : "This piece runs light for the weather: add a warm layer and a coat.";
}

// The note for a date, a dinner, a party or a formal event when the outfit
// has nothing dressy and the wardrobe does (R8, a soft rule). Until
// 2026-11-17 it printed the occasion's key: "For dinner-out, a silk, satin,
// lace or velvet piece would elevate the look." / "Pour dinner-out, …". It
// names no occasion now: the stylist's sentence just before it does ("relaxed
// for dinner out. … would dress it up for dinner out." said it twice).
export function dressyFabricNote(locale: TipLocale): string {
  return locale === "fr"
    ? "Une pièce en soie, en satin, en dentelle ou en velours rendrait la tenue plus habillée."
    : "A silk, satin, lace or velvet piece would dress it up.";
}

const MENTIONS_TIGHTS = /(?<![a-zà-ÿ])(tights|collants)(?![a-zà-ÿ])/i;

// Whether a tip already talks about tights: the weather warning then asks
// for "a warm layer and a coat" instead of tights a second time ("avec des
// collants bien chauds … ajoute des collants épais", 2026-11-16).
// The route's own tights line doesn't count: with it in place, the warning
// names tights itself and replaces it, one weather line instead of two.
export function mentionsTights(text: string | null | undefined): boolean {
  return MENTIONS_TIGHTS.test((text ?? "").replace(TIGHTS_NOTE.en, "").replace(TIGHTS_NOTE.fr, ""));
}

// The model still slips intensifiers into a tip now and then ("looking
// effortlessly confident", "completely composed", "strikingly confident"),
// the words that make it read machine-made. They go; the sentence reads the
// same without them.
const INTENSIFIER =
  /(?<![a-zà-ÿ])(completely|entirely|totally|utterly|effortlessly|absolutely|strikingly|incredibly|truly|complètement|totalement|parfaitement|absolument|vraiment|incroyablement)\s+/gi;

export function dropIntensifiers(text: string): string {
  return text.replace(INTENSIFIER, "").replace(/\s{2,}/g, " ").trim();
}

// The stylist's sentence as it is shown: no intensifiers, and a colon where
// the model joined the two parts with a semicolon ("Cuff the coat's sleeves
// once; the shirt peeks", 2026-11-17), a mark the app's voice never uses.
// French puts a space before the colon, which the model sometimes leaves out
// ("sans le boutonner entièrement: une allure", 2026-11-17). Only a colon
// between a letter and a space changes, so a time like 18:30 never does.
export function tidyTip(text: string, locale: TipLocale): string {
  const tidy = dropIntensifiers(text).replace(/\s*;\s*/g, locale === "fr" ? " : " : ": ");
  return locale === "fr" ? tidy.replace(/([a-zà-ÿ])\s?:\s+/gi, "$1 : ") : tidy;
}

// Adds a note after the tip. The tights reminder is skipped when the tip
// already talks about tights; a note that covers tights itself replaces the
// reminder already there; a note already present isn't added twice.
export function appendTipNote(tip: string | null | undefined, note: string, locale: TipLocale): string {
  const base = (tip ?? "").trim();
  if (!base) return note;
  if (base.includes(note)) return base;
  if (note === TIGHTS_NOTE[locale] && MENTIONS_TIGHTS.test(base)) return base;
  const kept = MENTIONS_TIGHTS.test(note) ? base.replace(TIGHTS_NOTE[locale], "").replace(/\s{2,}/g, " ").trim() : base;
  return kept ? `${kept} ${note}` : note;
}
