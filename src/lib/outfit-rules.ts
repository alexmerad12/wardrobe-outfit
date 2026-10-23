// Styling rules the owner decided on 2026-10-17 (the "taste calls" left
// open by the 2026-10-15 rules audit), as pure functions over item fields.
// The suggest route's validator, injectors and fallback gate each call the
// SAME function (one predicate per rule, see CLAUDE.md), wrapped with the
// request's context, and the unit tests pin the behavior. The prompt text in
// suggest-prompt.ts says exactly the same thing.

import type { ClothingItem } from "@/lib/types";

// ——— Rule 14, metal sync ———————————————————————————————————————————

const GOLD_FAMILY = new Set(["gold", "rose-gold", "matte-gold", "brass", "bronze"]);
const SILVER_FAMILY = new Set(["silver", "chrome", "matte-silver", "gunmetal"]);

/** Metal family of a piece's visible hardware, or null when it has none (or "mixed"). */
export function metalFamily(i: ClothingItem): "gold" | "silver" | "other" | null {
  const finish = i.category === "bag" ? i.bag_metal_finish : i.metal_finish;
  if (!finish || finish === "none" || finish === "mixed") return null;
  return GOLD_FAMILY.has(finish) ? "gold" : SILVER_FAMILY.has(finish) ? "silver" : "other";
}

/**
 * Why the outfit's visible hardware (shoes, belt, and the bag on Track A)
 * mixes metals badly, or null when it's fine. One family is fine. Two are
 * fine when one is the main metal (on 2+ pieces) and the other a single
 * accent: gold belt + gold bag + silver shoes. A one-and-one split, or three
 * families, is a mismatch. The Playful mood allows any mix.
 */
export function metalMixProblem(
  items: ClothingItem[],
  opts: { mensTrack: boolean; playful: boolean }
): string | null {
  if (opts.playful) return null;
  const pieces = items
    .filter(
      (i) =>
        i.category === "shoes" ||
        (i.category === "bag" && !opts.mensTrack) ||
        (i.category === "accessory" && i.subcategory === "belt")
    )
    .map((item) => ({ item, family: metalFamily(item) }))
    .filter((p) => p.family !== null);
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(p.family!, (counts.get(p.family!) ?? 0) + 1);
  if (counts.size <= 1) return null;
  const [main, accent] = [...counts.values()].sort((a, b) => b - a);
  if (counts.size === 2 && main >= 2 && accent === 1) return null;
  const list = pieces
    .map(({ item }) => `${item.subcategory ?? item.category}=${item.category === "bag" ? item.bag_metal_finish : item.metal_finish}`)
    .join(", ");
  return `metal mismatch: ${list}`;
}

// ——— Rule 13, Cozy palette ——————————————————————————————————————————

// Beige, tan, camel, brown and khaki are neutrals (classic colour guides, and
// the owner's call): they no longer trigger the clash. Only a strong warm
// colour next to a strong cool one does, judged from the colour's real hex.
const STRONG_WARM = /\b(?:rust|terracotta|mustard|ochre|orange|burnt|sienna|copper|amber|pumpkin|tangerine|marigold)\b/i;
const STRONG_COOL = /\b(?:green|teal|turquoise|aqua|cyan|purple|plum|lavender|violet|magenta|fuchsia|emerald|forest|kelly|royal|sapphire)\b/i;
// Chroma = (max - min) of the RGB channels, 0-1. Muted tones (sage green
// ~0.15, dusty lavender ~0.08, camel ~0.34 but camel is a neutral by name)
// stay below it; rust ~0.66, emerald ~0.47, teal ~0.50 clear it.
const STRONG_CHROMA = 0.3;

/** Colourfulness of a #rrggbb colour, 0 (grey) to 1, or null when unparseable. */
export function chroma(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

function hasStrong(item: ClothingItem, re: RegExp): boolean {
  return (item.colors ?? []).some((c) => re.test(c.name ?? "") && (chroma(c.hex ?? "") ?? 0) >= STRONG_CHROMA);
}

/**
 * The Cozy palette clash: a piece in a strong warm colour (rust, mustard,
 * orange) and ANOTHER piece in a strong cool one (emerald, teal, purple).
 * One printed piece carrying both is a designed palette, not a clash.
 */
export function cozyPaletteClash(items: ClothingItem[]): { warm: ClothingItem; cool: ClothingItem } | null {
  for (const warm of items) {
    if (!hasStrong(warm, STRONG_WARM)) continue;
    const cool = items.find((i) => i !== warm && hasStrong(i, STRONG_COOL));
    if (cool) return { warm, cool };
  }
  return null;
}

// ——— Rule 19, shoe × bottom ——————————————————————————————————————————

const isFlatShoe = (s: ClothingItem) => !s.heel_type || s.heel_type === "flat";

/**
 * Shoe × bottom proportions that look wrong at any occasion, or null.
 * Shared by the validator and the fallback gate (they had drifted: the
 * fallback had no espadrille rule).
 */
export function shoeBottomClash(shoe: ClothingItem, bottom: ClothingItem): string | null {
  const sub = shoe.subcategory;
  const fit = bottom.bottom_fit;
  const len = bottom.pants_length;
  const tallShaft = sub === "knee-boots" || shoe.shoe_height === "knee" || shoe.shoe_height === "over-knee";
  if (tallShaft && (fit === "wide-leg" || fit === "flared" || fit === "bootcut" || fit === "tapered")) {
    return `${sub ?? "tall boot"} (tall shaft) × ${fit} pants — shaft conflict`;
  }
  if (sub === "ankle-boots") {
    if (len === "ankle-crop") return "ankle-boots × ankle-crop pants — double horizontal at the ankle";
    if ((fit === "flared" || fit === "bootcut") && len === "full") {
      return `ankle-boots × full ${fit} pants — flare buries the boot`;
    }
  }
  // A full wide hem drowns a FLAT sandal; a heeled, wedge or platform sandal
  // shows under it (owner's call). Unknown heel height counts as flat.
  if (sub === "sandals" && len === "full" && fit === "wide-leg" && isFlatShoe(shoe)) {
    return "flat sandals × full wide-leg pants — hem drowns the strap";
  }
  if ((sub === "flats" || sub === "ballet-flats") && (fit === "flared" || fit === "bootcut") && len === "full") {
    return `${sub} × full ${fit} pants — dragging hem, leg looks stumpy`;
  }
  if (sub === "espadrilles" && bottom.subcategory === "trousers") {
    const mats = Array.isArray(bottom.material) ? bottom.material : [bottom.material];
    if (mats.some((m) => m === "wool" || m === "tweed")) return "espadrilles × wool/tweed trousers — formality mismatch";
  }
  return null;
}

// ——— Rule 9, the office dress ———————————————————————————————————————

/**
 * The dress that can't go to work, or null. Slip and mermaid never. Bodycon
 * only when it isn't a mini (a midi or maxi dress), is a neutral colour and
 * a blazer or cardigan is in the outfit (owner's call).
 */
export function workDressProblem(items: ClothingItem[]): ClothingItem | null {
  const dress = items.find(
    (i) =>
      i.category === "dress" &&
      (i.dress_silhouette === "slip" || i.dress_silhouette === "mermaid" || i.dress_silhouette === "bodycon")
  );
  if (!dress) return null;
  if (dress.dress_silhouette !== "bodycon") return dress;
  const notMini = dress.subcategory === "midi-dress" || dress.subcategory === "maxi-dress";
  const layered = items.some((i) => i.subcategory === "blazer" || i.subcategory === "cardigan");
  return notMini && dress.is_neutral && layered ? null : dress;
}

// ——— Rule 10, heels at casual occasions ——————————————————————————————

// Outdoor, travel and at-home: mid and high heels out. Casual and brunch:
// mid heels (a block-heel ankle boot) are fine, high heels out (owner's call).
const FLAT_OCCASIONS = new Set(["outdoor", "travel", "at-home"]);
const NO_HIGH_HEEL_OCCASIONS = new Set(["casual", "brunch"]);

/** True when this shoe's heel is too dressy for the occasion. */
export function heelTooDressy(shoe: ClothingItem, occasion: string): boolean {
  if (shoe.category !== "shoes") return false;
  if (shoe.heel_type === "high-heel") return FLAT_OCCASIONS.has(occasion) || NO_HIGH_HEEL_OCCASIONS.has(occasion);
  if (shoe.heel_type === "mid-heel") return FLAT_OCCASIONS.has(occasion);
  return false;
}

// ——— Rule R4b, layering proportions ——————————————————————————————————

// Not an owner call, a stylist one, but the same one-predicate discipline:
// the layering strip, the outerwear injector and the validator each kept a
// copy, and the injector's skipped an oversized top marked as a layering
// piece, so it put back the vest the strip had just removed and the
// validator dropped the outfit (an empty answer, 2026-10-23).
const LONG_COATS = new Set(["coat", "peacoat", "trench-coat", "parka"]);

/** The top whose bulk limits what goes over it: any top with Fit "oversized",
 *  a layering piece (an oversized cardigan) included. */
export function oversizedTop(items: ClothingItem[]): ClothingItem | undefined {
  return items.find((i) => i.category === "top" && i.fit === "oversized");
}

/** Whether this outerwear sits cleanly over an oversized top: a long, drapey
 *  coat, or an oversized / loose puffer. Structured shoulders (denim and
 *  leather jackets, bombers, blazers, vests) bunch over the bulk whatever
 *  their own fit. */
export function layersOverOversized(outer: ClothingItem): boolean {
  if (LONG_COATS.has(outer.subcategory ?? "")) return true;
  return outer.subcategory === "puffer" && (outer.fit === "oversized" || outer.fit === "loose");
}
