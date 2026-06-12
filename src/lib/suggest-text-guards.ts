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
