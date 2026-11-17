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
// effortlessly confident", "completely composed"), the words that make it
// read machine-made. They go; the sentence reads the same without them.
const INTENSIFIER = /(?<![a-zà-ÿ])(completely|entirely|totally|utterly|effortlessly|absolutely|complètement|totalement|parfaitement|absolument)\s+/gi;

export function dropIntensifiers(text: string): string {
  return text.replace(INTENSIFIER, "").replace(/\s{2,}/g, " ").trim();
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
