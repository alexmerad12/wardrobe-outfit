// Shared text guards for AI-written stylist prose (suggest + refine).
// Extracted from suggest/route.ts so refine stops shipping the exact
// failure modes suggest was hardened against (hallucinated garments,
// garbled French, multi-sentence rambles).
import type { ClothingItem } from "@/lib/types";

// Trim AI prose down to a single sentence. Models sometimes return two
// or three sentences even when we ask for one; this captures the first
// clause up through its terminal punctuation.
export function oneSentence(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.trim();
  const match = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

// Every category-signal word that would betray a hallucination. If the AI
// writes "the moto jacket" when no outerwear is in item_ids, we swap in
// server-built text instead of showing the mismatch.
const HALLUCINATION_WORDS_EN: Record<string, string[]> = {
  top: ["t-shirt", "tshirt", "tee", "tank", "blouse", "shirt", "sweater", "hoodie", "cardigan", "pullover"],
  bottom: ["jeans", "trousers", "pants", "leggings", "sweatpants", "shorts", "skirt", "chinos", "slacks"],
  dress: ["dress", "gown", "sundress", "maxi dress", "midi dress", "mini dress"],
  "one-piece": ["jumpsuit", "overalls", "romper"],
  outerwear: ["jacket", "blazer", "vest", "coat", "windbreaker", "puffer", "bomber", "moto", "trench", "peacoat", "parka", "biker"],
  shoes: ["boot", "sneaker", "heel", "sandal", "loafer", "mule", "oxford", "pump"],
  bag: ["handbag", "backpack", "tote", "clutch", "crossbody", "purse"],
  accessory: ["belt", "scarf", "beanie"],
};

// French garment vocabulary — checked only for locale=fr (words like
// "pull" and "basket" are ordinary English words, so they must not run
// against English prose). The FR list was missing originally: for
// locale=fr users, "la veste de moto" with no jacket in the outfit
// sailed straight through the gate.
const HALLUCINATION_WORDS_FR: Record<string, string[]> = {
  top: ["débardeur", "chemisier", "chemise", "pull", "tricot", "camisole"],
  bottom: ["jean", "pantalon", "legging", "jogging", "jupe"],
  dress: ["robe"],
  "one-piece": ["combinaison", "salopette"],
  outerwear: ["veste", "blouson", "manteau", "doudoune"],
  shoes: ["botte", "bottine", "basket", "talon", "sandale", "mocassin", "escarpin"],
  bag: ["sac", "pochette", "cabas"],
  accessory: ["ceinture", "écharpe", "foulard", "bonnet", "tuque"],
};

// Gemini occasionally garbles accented French chars in JSON-schema
// string outputs — é flips to `)`, ô flips to `"`, etc. The pattern is
// consistent: a letter, a stray bracket / quote / paren, then another
// letter — punctuation INSIDE a word where it has no business being.
const FRENCH_CORRUPTION_RX = /[a-zà-ÿ][")(\][}{<>][a-zà-ÿ]/i;

export function hasFrenchCorruption(text: string): boolean {
  return FRENCH_CORRUPTION_RX.test(text);
}

// JS \b is ASCII-only — it never matches at the edge of "écharpe", so
// accented words need explicit letter lookarounds instead.
function wordRx(word: string): RegExp {
  const escaped = word.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-zà-ÿ])${escaped}s?(?![a-zà-ÿ])`, "i");
}

// Garment words per slot, grouped by what they name, EN with the FR
// equivalents. A group "describes" an item when one of its EN words
// matches the item's name or subcategory.
const SLOT_CONCEPTS: Record<string, { en: string[]; fr: string[] }[]> = {
  shoes: [
    { en: ["boot"], fr: ["botte", "bottine", "boots"] },
    { en: ["sneaker", "trainer"], fr: ["basket", "sneaker", "tennis"] },
    { en: ["loafer"], fr: ["mocassin", "loafer"] },
    { en: ["heel", "pump"], fr: ["talon", "escarpin"] },
    { en: ["sandal"], fr: ["sandale", "nu-pied"] },
    { en: ["mule"], fr: ["mule"] },
    { en: ["espadrille"], fr: ["espadrille"] },
    { en: ["ballet flat", "ballet-flat"], fr: ["ballerine"] },
    { en: ["oxford", "derby", "brogue"], fr: ["richelieu", "derby"] },
  ],
  outerwear: [
    { en: ["coat", "peacoat", "overcoat"], fr: ["manteau", "caban", "pardessus"] },
    { en: ["puffer", "parka"], fr: ["doudoune", "parka"] },
    { en: ["trench", "raincoat"], fr: ["trench", "imperméable", "imper"] },
    { en: ["blazer"], fr: ["blazer"] },
    { en: ["bomber"], fr: ["bomber", "blouson"] },
    { en: ["windbreaker"], fr: ["coupe-vent"] },
    { en: ["vest", "gilet"], fr: ["gilet"] },
    { en: ["jacket"], fr: ["veste", "blouson"] },
    { en: ["hoodie"], fr: ["capuche", "hoodie"] },
  ],
};

// Material enum values as French prose names them.
const FR_MATERIAL_WORDS: Record<string, string[]> = {
  leather: ["cuir"],
  "faux-leather": ["simili", "cuir"],
  "patent-leather": ["vernis", "cuir"],
  suede: ["daim", "suède"],
  canvas: ["toile"],
  wool: ["laine"],
  cotton: ["coton"],
  silk: ["soie"],
  satin: ["satin"],
  linen: ["lin"],
  corduroy: ["velours"],
  velvet: ["velours"],
  fleece: ["polaire"],
  knit: ["maille", "tricot"],
  cashmere: ["cachemire"],
  rubber: ["caoutchouc"],
  denim: ["denim"],
};

const NAME_STOPWORDS = new Set([
  "and", "the", "with", "for", "from", "dark", "light", "deep", "pale",
  "de", "du", "des", "et", "en", "le", "la", "les", "un", "une", "avec", "pour",
]);

// Identifying words of an item: its name, subcategory and materials
// (plus the French material words for French prose), lowercased, 3+
// letters, plural "s" dropped so "boots" also matches "boot".
function itemWords(i: ClothingItem, locale: "en" | "fr", withColors = false): Set<string> {
  const mats = (Array.isArray(i.material) ? i.material : [i.material]).filter(
    (m): m is NonNullable<typeof m> => !!m
  );
  const parts: string[] = [i.name ?? "", i.subcategory ?? "", ...mats];
  if (locale === "fr") for (const m of mats) parts.push(...(FR_MATERIAL_WORDS[m] ?? []));
  if (withColors) for (const c of i.colors ?? []) parts.push(c?.name ?? "");
  const out = new Set<string>();
  for (const w of parts.join(" ").toLowerCase().split(/[^a-zà-ÿ0-9]+/)) {
    if (w.length < 3 || NAME_STOPWORDS.has(w)) continue;
    out.add(w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
  }
  return out;
}

// After the server swaps a piece (a shoe that breaks a rule, a coat the
// rain refuses), the AI's sentence can still describe the piece it
// picked: "the black leather boots anchor the look" over sneakers.
// textIsConsistent can't see that (the outfit still has shoes). True when
// the text names the swapped-out piece: a word of its name, subcategory
// or material that no piece of the final outfit shares, or a slot word
// ("boots", "bottines") that fits it and not its replacement.
export function textMentionsSwappedOut(
  text: string,
  removed: ClothingItem,
  outfit: ClothingItem[],
  locale: "en" | "fr" = "en"
): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const kept = new Set(outfit.flatMap((i) => [...itemWords(i, locale, true)]));
  for (const w of itemWords(removed, locale)) {
    if (!kept.has(w) && wordRx(w).test(lower)) return true;
  }
  const describes = (i: ClothingItem, words: string[]) => {
    const label = `${i.name ?? ""} ${(i.subcategory ?? "").replace(/-/g, " ")}`.toLowerCase();
    return words.some((w) => wordRx(w).test(label));
  };
  const replacements = outfit.filter((i) => i.category === removed.category);
  for (const concept of SLOT_CONCEPTS[removed.category] ?? []) {
    if (!describes(removed, concept.en) || replacements.some((r) => describes(r, concept.en))) continue;
    const words = locale === "fr" ? [...concept.en, ...concept.fr] : concept.en;
    if (words.some((w) => wordRx(w).test(lower))) return true;
  }
  return false;
}

export function textIsConsistent(
  items: ClothingItem[],
  text: string,
  locale: "en" | "fr" = "en"
): boolean {
  if (!text) return false;
  // Bail before the hallucination check if the string is character-
  // corrupted — fixing the hallucination would still ship "dor)e".
  if (hasFrenchCorruption(text)) return false;
  // "garde-robe" legitimately appears in French prose without implying
  // a dress ("robe") is in the outfit — blank it before word-matching.
  const lower = text.toLowerCase().replace(/garde-robes?/g, "");
  const present = new Set(items.map((i) => i.category));
  const vocabularies =
    locale === "fr"
      ? [HALLUCINATION_WORDS_EN, HALLUCINATION_WORDS_FR]
      : [HALLUCINATION_WORDS_EN];
  for (const vocab of vocabularies) {
    for (const [cat, words] of Object.entries(vocab)) {
      if (present.has(cat as ClothingItem["category"])) continue;
      for (const w of words) {
        if (wordRx(w).test(lower)) return false;
      }
    }
  }
  return true;
}
