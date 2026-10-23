// Names in sentence case, the way French titles and the app's own copy write
// them: "Black polyester tank top", "Bohème assumé". Photo tagging and the
// stylist wrote some names in English title case ("Black Polyester Tank Top",
// "Audace Texturée Urban"), so the wardrobe grid mixed two styles and French
// look names read as English (design review, 2026-10-23).

const WORD = /\p{L}[\p{L}\p{M}\p{N}'’-]*/gu;

/** True when the name has 2+ words and every word of 2+ letters starts with a
 *  capital: "Blue Denim Jeans" yes, "Blue denim jeans" and "Jeans" no. */
export function isTitleCase(name: string): boolean {
  const words = name.match(WORD) ?? [];
  if (words.length < 2) return false;
  return words.every((w) => w.length < 2 || w[0] === w[0].toUpperCase());
}

function lowerSegment(segment: string): string {
  // Kept as written: a single letter before a hyphen (T-shirt, V-neck), an
  // acronym (NYC), a word with a capital inside (iPhone, McQueen).
  if (segment.length === 1) return segment;
  if (segment === segment.toUpperCase() && segment !== segment.toLowerCase()) return segment;
  if (/\p{Lu}/u.test(segment.slice(1))) return segment;
  return segment.toLowerCase();
}

function lowerWord(word: string): string {
  return word
    .split("-")
    .map((segment) => {
      // An elision (d'Automne, aujourd'Hui): the letters before the
      // apostrophe are lowered, the rest is a segment of its own.
      const parts = segment.split(/(['’])/);
      if (parts.length === 1) return lowerSegment(segment);
      return parts.map((p, i) => (i % 2 === 1 ? p : i === 0 ? p.toLowerCase() : lowerSegment(p))).join("");
    })
    .join("-");
}

/** "Blue Denim Jeans" -> "Blue denim jeans", "White V-Neck Tank Top" -> "White V-neck
 *  tank top". The first word keeps its spelling with a capital first letter. */
export function toSentenceCase(name: string): string {
  let first = true;
  return name.replace(WORD, (word) => {
    if (first) {
      first = false;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return lowerWord(word);
  });
}

/** A name in title case comes back in sentence case; anything else as is. */
export function sentenceCaseIfTitled(name: string): string {
  return isTitleCase(name) ? toSentenceCase(name) : name;
}
