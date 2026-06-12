import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { kv } from "@vercel/kv";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
import { orderOutfitItems } from "@/lib/outfit-order";
import { getWeather, getSeasonFromMonth } from "@/lib/weather";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";
import {
  oneSentence,
  textIsConsistent,
  hasFrenchCorruption,
} from "@/lib/suggest-text-guards";
import { buildStaticRulesBlock } from "@/lib/suggest-prompt";

// Suggest endpoint runs on Gemini 3 Flash with shallow thinking
// (thinkingBudget: 3072). 2026-05-08 experiment: shifted from
// 3-outfit-generation + scoring to single-outfit generation. The
// scorer was reliably picking outfits with the same star pieces
// across calls, so users felt repetition even with random
// subsetting. Single-outfit lets the model spend its full reasoning
// on one composition; the swap + refine flow handles refinement
// instead of a server-side picker. Targets ~8-12s per call. Other
// endpoints (try-on, analyze, packing) still use their existing
// configs — this is suggest-specific.
// GOOGLE_API_KEY must be set in .env.local locally and in Vercel env
// settings for deploys.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

const SUGGEST_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    outfits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
          name: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          styling_tip: { type: Type.STRING, nullable: true },
        },
        required: ["item_ids", "name", "reasoning"],
      },
    },
    wardrobe_gap: { type: Type.STRING, nullable: true },
  },
  required: ["outfits"],
};

// ─────────────────────────────────────────────────────────────────
// Server-side description builder. We used to let the AI write the
// reasoning and styling_tip, but the AI hallucinated categories that
// weren't in item_ids ("the moto jacket" when there was no jacket).
// Every prompt tweak to stop this either left the hallucination intact
// or made the validator drop outfits, so we stopped asking the AI for
// prose and now compose a short sentence from the actual item_ids.
// Always accurate; nothing to hallucinate.
// ─────────────────────────────────────────────────────────────────
type Locale = "en" | "fr";

function pieceLabel(item: ClothingItem, locale: Locale): string {
  const cat = item.category;
  const sub = item.subcategory ?? "";
  if (locale === "fr") {
    if (cat === "dress") return "la robe";
    if (cat === "one-piece") return sub === "overalls" ? "la salopette" : "la combinaison";
    if (cat === "top") return "le haut";
    if (cat === "bottom") {
      if (sub === "skirt") return "la jupe";
      if (sub === "shorts") return "le short";
      return "le pantalon";
    }
    if (cat === "outerwear") {
      if (sub === "blazer") return "le blazer";
      if (sub === "coat" || sub === "trench-coat" || sub === "peacoat" || sub === "parka") return "le manteau";
      if (sub === "vest") return "le gilet";
      return "la veste";
    }
    if (cat === "shoes") return "les chaussures";
    if (cat === "bag") return "le sac";
    if (cat === "accessory") {
      if (sub === "belt") return "la ceinture";
      if (sub === "scarf") return "l'écharpe";
      if (sub === "hat") return "le chapeau";
      return "l'accessoire";
    }
    return "la pièce";
  }
  // English
  if (cat === "dress") return "the dress";
  if (cat === "one-piece") return sub === "overalls" ? "the overalls" : "the jumpsuit";
  if (cat === "top") return "the top";
  if (cat === "bottom") {
    if (sub === "skirt") return "the skirt";
    if (sub === "shorts") return "the shorts";
    return "the bottoms";
  }
  if (cat === "outerwear") {
    if (sub === "blazer") return "the blazer";
    if (sub === "coat" || sub === "trench-coat" || sub === "peacoat" || sub === "parka") return "the coat";
    if (sub === "vest") return "the vest";
    return "the jacket";
  }
  if (cat === "shoes") return "the shoes";
  if (cat === "bag") return "the bag";
  if (cat === "accessory") {
    if (sub === "belt") return "the belt";
    if (sub === "scarf") return "the scarf";
    if (sub === "hat") return "the hat";
    return "the accessory";
  }
  return "the piece";
}

// Read the outfit's pieces in a natural order (base → layers → feet →
// extras) so the resulting sentence flows the way a person would read
// the outfit top-to-bottom.
function moodTone(mood: Mood, locale: Locale): string {
  if (locale === "fr") {
    const map: Record<Mood, string> = {
      energized: "plein d'énergie",
      confident: "soigné",
      playful: "ludique",
      cozy: "douillet",
      chill: "décontracté",
      bold: "affirmé",
      period: "tout en confort",
      sad: "tout en douceur",
    };
    return map[mood];
  }
  const map: Record<Mood, string> = {
    energized: "fresh",
    confident: "polished",
    playful: "playful",
    cozy: "cozy",
    chill: "easy",
    bold: "statement-ready",
    period: "comfort-first",
    sad: "soft and gentle",
  };
  return map[mood];
}

function occasionLabelLocalized(occasion: Occasion, locale: Locale): string {
  if (locale === "fr") {
    const map: Record<Occasion, string> = {
      "at-home": "à la maison",
      casual: "un look casual",
      brunch: "un brunch",
      outdoor: "une sortie en plein air",
      travel: "un voyage",
      "dinner-out": "un dîner dehors",
      work: "le travail",
      date: "un rendez-vous",
      party: "une soirée",
      formal: "un événement habillé",
    };
    return map[occasion];
  }
  // Existing OCCASION_LABELS gives Title-Case nouns; lowercase them so
  // they read naturally mid-sentence ("polished for dinner out").
  return OCCASION_LABELS[occasion].toLowerCase();
}

function buildReasoning(
  items: ClothingItem[],
  mood: Mood,
  occasion: Occasion,
  weather: WeatherData | null,
  locale: Locale
): string {
  // Magazine-voice editorial sentence variants — pick one at random.
  // The bar: each line should read like a one-line caption you'd see
  // under an editorial spread. Avoid filler ("perfect for", "this
  // outfit"), avoid checklist syntax (listing every piece), and lean
  // on cadence — em-dashes, parallel clauses, sensory adjectives.
  const tone = moodTone(mood, locale);
  const occ = occasionLabelLocalized(occasion, locale);
  const temp = weather?.temp;
  const tempPhrase = (() => {
    if (typeof temp !== "number") return "";
    if (locale === "fr") {
      if (temp <= 5) return ` pour le froid`;
      if (temp <= 12) return ` pour la fraîcheur`;
      if (temp >= 25) return ` pour la chaleur`;
      return "";
    }
    if (temp <= 5) return ` for the cold`;
    if (temp <= 12) return ` for the chill`;
    if (temp >= 25) return ` for the warmth`;
    return "";
  })();

  // Material signal — gives certain variants a textural angle to lean on.
  const materials = new Set<string>();
  for (const it of items) {
    const m = Array.isArray(it.material) ? it.material : [it.material];
    for (const x of m) if (x) materials.add(x);
  }
  const hasKnit = materials.has("knit") || materials.has("wool") || materials.has("cashmere");
  const hasDenim = materials.has("denim");
  const hasSleek = materials.has("silk") || materials.has("satin") || materials.has("leather");
  const hasStructured = items.some(
    (i) => i.subcategory === "blazer" || i.subcategory === "trench-coat" || i.subcategory === "peacoat"
  );

  // Toggle that occasionally references the temperature when it's a
  // notable extreme — adds variety without appearing every line.
  const variants: string[] =
    locale === "fr"
      ? [
          // Universal editorial openings
          `Une composition ${tone}, pensée pour ${occ}${tempPhrase}.`,
          `Silhouette ${tone}, posée — taillée pour ${occ}.`,
          `Un parti pris ${tone} : moins de bruit, plus d'intention.`,
          `Lignes nettes, ton retenu — ${tone} pour ${occ}.`,
          `Discret, mesuré — la version ${tone} de ${occ}.`,
          `Tout est dans la cadence : ${tone}, jamais forcé.`,
          `Une réponse ${tone} à ${occ}, sans surcharge.`,
          // Material-conditional flourishes
          ...(hasKnit
            ? [
                `Mailles enveloppantes, palette posée — ${tone} pour ${occ}${tempPhrase}.`,
                `La douceur de la maille fait tout le travail.`,
              ]
            : []),
          ...(hasDenim
            ? [
                `Une pièce en denim ancre l'ensemble; le reste reste léger.`,
                `Le denim donne la base; les détails font le reste.`,
              ]
            : []),
          ...(hasSleek
            ? [
                `Matières fluides, proportions équilibrées — ${tone} pour ${occ}.`,
                `Une touche de brillance pour relever l'ensemble — ${tone}, sans excès.`,
              ]
            : []),
          ...(hasStructured
            ? [
                `Une pièce structurée pour la rigueur, le reste pour la souplesse.`,
                `Tailoring affirmé, lignes assouplies — ${tone} et juste.`,
              ]
            : []),
        ]
      : [
          // Universal editorial openings
          `A ${tone} composition, tuned for ${occ}${tempPhrase}.`,
          `Quietly ${tone} — sharp where it counts, easy where it doesn't.`,
          `A ${tone} answer to ${occ}: less noise, more intention.`,
          `Easy proportions, deliberate restraint — ${tone} energy throughout.`,
          `Editorial restraint, ${tone} register — built for ${occ}.`,
          `All the right textures, none of the noise.`,
          `Lived-in but considered — exactly the kind of look that holds up at ${occ}${tempPhrase}.`,
          `The mood lands first; the styling closes the deal.`,
          `Soft edges on a structured foundation — ${tone} for ${occ}.`,
          // Material-conditional flourishes
          ...(hasKnit
            ? [
                `Soft knits, quiet palette — the kind of ease that reads intentional.`,
                `Knit-led layering, sharpened just enough — ${tone} for ${occ}${tempPhrase}.`,
                `Wrapped in something soft, then walked out the door.`,
              ]
            : []),
          ...(hasDenim
            ? [
                `Denim grounds the look; everything above stays uncomplicated.`,
                `A denim anchor with a lighter hand on top — ${tone} for ${occ}.`,
                `Worn-in denim, sharper accents — the ${tone} math.`,
              ]
            : []),
          ...(hasSleek
            ? [
                `Sleek surfaces, balanced proportions — ${tone} for ${occ}.`,
                `One liquid texture, the rest matte — that's the trick.`,
                `A whisper of sheen on a quiet base — ${tone} done well.`,
              ]
            : []),
          ...(hasStructured
            ? [
                `Tailored at the shoulder, easier below — ${tone} with intent.`,
                `Structure on top, softness underneath — the ${tone} cadence.`,
              ]
            : []),
        ];

  return variants[Math.floor(Math.random() * variants.length)];
}

// Text guards (oneSentence / textIsConsistent / hasFrenchCorruption)
// live in src/lib/suggest-text-guards.ts — shared with /api/suggest/refine.

function buildStylingTip(items: ClothingItem[], locale: Locale): string | null {
  const outerwear = items.find((i) => i.category === "outerwear");
  const hasBase =
    items.some((i) => i.category === "dress") ||
    items.some((i) => i.category === "one-piece") ||
    (items.some((i) => i.category === "top") &&
      items.some((i) => i.category === "bottom"));
  const belt = items.find((i) => i.category === "accessory" && i.subcategory === "belt");
  const overalls = items.find((i) => i.category === "one-piece" && i.subcategory === "overalls");
  const scarf = items.find((i) => i.category === "accessory" && i.subcategory === "scarf");
  const dress = items.find((i) => i.category === "dress");
  const topTuckable = items.some(
    (i) =>
      i.category === "top" &&
      !i.is_layering_piece &&
      i.subcategory !== "hoodie" &&
      i.subcategory !== "sweater"
  );
  const hasBottom = items.some((i) => i.category === "bottom");

  // Pick a random variant from the matching scenario. More variants =
  // less repetition when the AI's tip fails the consistency check and
  // we have to fall back to the server template.
  const pick = (variants: string[]): string =>
    variants[Math.floor(Math.random() * variants.length)];

  if (outerwear && hasBase) {
    const ow = pieceLabel(outerwear, locale);
    return pick(
      locale === "fr"
        ? [
            `Porte ${ow} ouvert·e par-dessus la base — la structure reste optionnelle.`,
            `Laisse ${ow} déboutonné·e; la silhouette gagne en légèreté.`,
            `Pousse les manches de ${ow} jusqu'au coude — ça casse la rigueur sans la perdre.`,
            `Drape ${ow} sur les épaules plutôt que de l'enfiler — plus délibéré, moins serré.`,
            `Retrousse les poignets de ${ow} d'un tour; ça dévoile la chemise et adoucit la ligne.`,
            `Sort le col du haut par-dessus ${ow} pour un finish moins formel.`,
            `Garde ${ow} ouvert·e, mains dans les poches — la pose fait la moitié du travail.`,
          ]
        : [
            `Wear ${ow} open and let it move; structure stays optional.`,
            `Leave ${ow} unbuttoned — the silhouette stays uncomplicated.`,
            `Push ${ow}'s sleeves to the elbow; relaxes the line without losing the shape.`,
            `Drape ${ow} over your shoulders rather than wearing it — reads more deliberate.`,
            `Cuff ${ow}'s sleeves once; the shirt peeks, the structure softens.`,
            `Pop the collar of the layer underneath out over ${ow} for a less formal finish.`,
            `Keep ${ow} open, hands in pockets — the posture does half the work.`,
            `Sleeve-push and a single roll at the cuff — the easy version of structured.`,
          ]
    );
  }
  if (belt && hasBottom && topTuckable) {
    return pick(
      locale === "fr"
        ? [
            `Rentre le devant du haut et cinch la ceinture à la taille naturelle.`,
            `Demi-rentré devant; laisse la ceinture définir la silhouette.`,
            `Cinch la ceinture, à peine plus haut que la taille — ça allonge la jambe.`,
            `Front-tuck minimal, ceinture marquée — le point focal est sur l'os de la hanche.`,
            `Glisse juste un coin du haut sous la ceinture; assez pour qu'elle se voit.`,
          ]
        : [
            `Front-tuck the top, cinch the belt at the natural waist.`,
            `Half-tuck the front and let the belt anchor the waist — barely there, but it changes everything.`,
            `Sit the belt just above the natural waist; lengthens the leg.`,
            `Tuck just one corner under the belt — enough to let it read.`,
            `Front-tuck for waist definition; the belt becomes the focal point on the hip.`,
            `Loop the belt loosely; the looseness keeps it casual without losing the line.`,
          ]
    );
  }
  if (overalls) {
    return pick(
      locale === "fr"
        ? [
            `Laisse les bretelles un peu lâches; la salopette tombe mieux qu'elle se porte.`,
            `Roule les revers une fois — le mollet apparaît, la silhouette s'allonge.`,
            `Pousse les manches du haut en-dessous; ça casse la rigueur et fait bouger la mat.`,
            `Garde un côté des bretelles légèrement déboutonné — ça lâche le côté trop sage.`,
          ]
        : [
            `Loosen the straps slightly — overalls fall better than they cling.`,
            `Roll the cuffs once; ankle reads, leg lengthens.`,
            `Push the sleeves of whatever's underneath — softens the structure, adds movement.`,
            `Leave one strap a touch undone for a less buttoned-up finish.`,
          ]
    );
  }
  if (scarf) {
    return pick(
      locale === "fr"
        ? [
            `Noue le foulard bas et sur le côté — volume au cou, propre en-dessous.`,
            `Drape le foulard plutôt que de le nouer — il bouge, la silhouette reste fluide.`,
            `Glisse le foulard à travers l'anse du sac comme accent — petit détail, gros effet.`,
            `Plie le foulard en triangle, noue-le derrière la nuque — version années 90 maîtrisée.`,
          ]
        : [
            `Knot the scarf low and to the side — volume at the neck, clean below.`,
            `Drape the scarf loosely rather than tying it tight; let it move with you.`,
            `Loop the scarf through a bag handle as an accent — small detail, big punch.`,
            `Fold it triangle-style and knot it at the nape — the controlled '90s version.`,
            `Wear it as a head scarf, sunglasses on top — old-Hollywood with a modern hand.`,
          ]
    );
  }
  if (dress) {
    return pick(
      locale === "fr"
        ? [
            `Garde le reste minimal — laisse la robe parler.`,
            `Une seule pièce de bijouterie fine; tout le reste recule.`,
            `Une ceinture fine à la taille définirait la silhouette si tu veux la marquer.`,
            `Pousse les manches si elles sont longues — ça allège l'ensemble.`,
            `Cheveux remontés pour montrer l'encolure; la robe en sort gagnante.`,
          ]
        : [
            `Keep accessories minimal — let the dress lead.`,
            `One fine piece of jewelry; let everything else recede.`,
            `A thin belt at the natural waist would sharpen the silhouette if you want one.`,
            `Push the sleeves if they're long — keeps the look from feeling overdressed.`,
            `Pull hair off the neck so the neckline reads — the dress earns the spotlight.`,
          ]
    );
  }
  if (topTuckable && hasBottom) {
    return pick(
      locale === "fr"
        ? [
            `Rentre juste le devant du haut — l'arrière retombe naturellement.`,
            `Demi-rentré devant pour une ligne plus douce.`,
            `Roule les manches au coude et front-tuck — les proportions restent justes.`,
            `Glisse un coin du haut dans le bas; le reste flotte, tout reste désinvolte.`,
            `Pousse les manches, déboutonne un bouton de plus — l'attitude vient du detail.`,
          ]
        : [
            `Tuck just the front of the top — let the back fall naturally.`,
            `Half-tuck the front; the line softens without losing definition.`,
            `Roll the sleeves to the elbow and front-tuck — keeps the proportions intentional.`,
            `Tuck just one corner; the rest floats, the whole thing stays easy.`,
            `Push the sleeves up, undo one extra button — attitude lives in the small choices.`,
          ]
    );
  }
  return null;
}

function describeItem(item: ClothingItem): string {
  const parts: string[] = [`[${item.id}]`, item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);

  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);

  if (item.fit) parts.push(`Fit: ${item.fit}`);
  if (item.bottom_fit) parts.push(`Bottom fit: ${item.bottom_fit}`);
  if (item.length) parts.push(`Length: ${item.length}`);
  if (item.pants_length) parts.push(`Pant length: ${item.pants_length}`);
  if (item.waist_height) parts.push(`Waist: ${item.waist_height}`);
  if (item.waist_style) parts.push(`Waist style: ${item.waist_style}`);
  if (item.waist_closure) parts.push(`Waist closure: ${item.waist_closure}`);
  if (item.shoe_height) parts.push(`Height: ${item.shoe_height}`);
  if (item.heel_type) parts.push(`Heel: ${item.heel_type}`);
  if (item.shoe_closure) parts.push(`Shoe closure: ${item.shoe_closure}`);
  if (item.belt_style) parts.push(`Belt style: ${item.belt_style}`);
  // belt_compatible flag deprecated — belt-fit is derived from
  // silhouette / fit / waist_style / waist_closure in Rule 18a.
  if (item.metal_finish && item.metal_finish !== "none") parts.push(`Metal: ${item.metal_finish}`);
  if (item.bag_size) parts.push(`Bag size: ${item.bag_size}`);
  if (item.bag_texture) parts.push(`Bag texture: ${item.bag_texture}`);
  if (item.bag_metal_finish && item.bag_metal_finish !== "none") parts.push(`Bag metal: ${item.bag_metal_finish}`);
  if (item.hat_texture) parts.push(`Hat texture: ${item.hat_texture}`);
  if (item.hat_silhouette) parts.push(`Hat silhouette: ${item.hat_silhouette}`);
  if (item.scarf_function) parts.push(`Scarf function: ${item.scarf_function}`);
  if (item.skirt_length) parts.push(`Skirt length: ${item.skirt_length}`);
  if (item.dress_silhouette) parts.push(`Silhouette: ${item.dress_silhouette}`);
  if (item.toe_shape) parts.push(`Toe: ${item.toe_shape}`);
  if (item.neckline) parts.push(`Neckline: ${item.neckline}`);
  if (item.sleeve_length) parts.push(`Sleeves: ${item.sleeve_length}`);
  if (item.closure) parts.push(`Closure: ${item.closure}`);
  if (item.is_layering_piece) parts.push("(layering piece)");

  const mats = Array.isArray(item.material) ? item.material : [item.material];
  parts.push(`Material: ${mats.join(", ")}`);

  const pats = Array.isArray(item.pattern) ? item.pattern : [item.pattern];
  parts.push(`Pattern: ${pats.join(", ")}`);

  const formalities = Array.isArray(item.formality) ? item.formality : [item.formality];
  parts.push(`Formality: ${formalities.join(", ")}`);

  if (item.seasons.length) parts.push(`Seasons: ${item.seasons.join(", ")}`);
  if (item.occasions.length) parts.push(`Occasions: ${item.occasions.join(", ")}`);
  parts.push(`Warmth: ${item.warmth_rating}/5`);
  // rain_appropriate no longer surfaced to AI — material-intelligence covers it
  if (item.brand) parts.push(`Brand: ${item.brand}`);
  if (item.is_favorite) parts.push("Favorited");
  // Wear-frequency signal: lets the AI prefer under-rotated pieces
  // when choosing between comparable options.
  const wornCount = item.times_worn ?? 0;
  if (wornCount === 0) {
    parts.push("Never worn");
  } else {
    parts.push(`Worn ${wornCount}x`);
    if (item.last_worn_date) {
      // last_worn_date is a user-LOCAL date-only string; its UTC-
      // midnight parse drifted the count by one across the user's
      // evening (audit P3). Anchor at UTC noon so "worn today" reads
      // 0d all day.
      const days = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(item.last_worn_date + "T12:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      parts.push(`Last worn ${days}d ago`);
    }
  }

  return parts.join(" | ");
}

// Daily suggest cap — matches the planned Linette Basic tier limit
// 2026-05-26 — dropped 10 -> 3 after the gemini-3-flash-preview ->
// gemini-3.5-flash model swap. New cost is ~$0.087/call vs old
// $0.029, so 10/day would put worst-case at $26/mo per user (~8x
// the $3.33/mo Linette tier revenue). 3/day keeps worst-case at
// ~$7.83/mo per user — still over revenue at worst case but the
// average user lands well under, so unit economics work on the mix.
// Three cap presets to keep in mind once subscription tiers ship:
//   - Conservative: 2/day (~$5/mo worst)
//   - Balanced:     3/day (~$7.83/mo worst)  ← current beta cap
//   - Generous:     5/day (~$13/mo worst)    ← future Atelier tier
// Beta runs at the cap that matches the eventual Linette tier so
// friends experience the real constraint, not beta-only generosity
// that would force a rough downgrade at launch.
const SUGGEST_DAILY_CAP = 3;

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  // Daily-cap gate. Increment first so attempts (including rejected
  // ones) get logged — useful telemetry on whether the cap is binding.
  // Server UTC date is the calendar — for our small beta in similar
  // time zones this is fine; tier-aware enforcement at launch can
  // localize per-user if needed. 36h TTL covers any TZ wraparound.
  // Admin-bypass: ADMIN_EMAIL + CAP_BYPASS_EMAILS skip enforcement
  // (so the operator and trusted testers can use the app freely
  // without burning their daily limit) but the counter still
  // increments so cost telemetry stays honest.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const isAdmin = isCapBypassed(authUser?.email);
  const today = localDayKey(request);
  const countKey = `suggest_count:${userId}:${today}`;
  // Consumed AFTER the free early-exits (body parse, <3-items) so a
  // malformed request or thin wardrobe doesn't burn quota; refunded on
  // every exit that delivered nothing. null = not consumed yet.
  let capCount: number | null = null;

  try {
    const { mood, occasion, styleWishes = [], anchorItemId = null, locale = "en" } = (await request.json()) as {
      mood: Mood;
      occasion: Occasion;
      styleWishes?: string[];
      anchorItemId?: string | null;
      locale?: "en" | "fr";
    };

    const languageName = locale === "fr" ? "French" : "English";

    // KV-backed medium-term memory of outfits we've SUGGESTED to this user.
    // The `recent_outfits` table tracks worn outfits; it wouldn't catch the
    // user mashing "Suggest" four times in five minutes and getting the
    // same three looks each time. We cap at 40 remembered sets with a 7d
    // TTL so the anti-repetition window covers a normal usage cadence
    // (few-times-per-week) without ossifying forever.
    const suggestionsKey = `recent-suggestions:${userId}`;
    const kvRecentSuggestions = (await kv
      .get<string[][]>(suggestionsKey)
      .catch(() => null)) ?? [];

    const [itemsRes, prefsRes, outfitsRes, recentRes] = await Promise.all([
      supabase.from("clothing_items").select("*").eq("is_stored", false),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      // Fetch up to 30 favorites (we sample a subset per call once the
      // pool is large enough — see sample-threshold logic below).
      supabase
        .from("outfits")
        .select("*")
        .eq("is_favorite", true)
        .order("created_at", { ascending: false })
        .limit(30),
      // Last ~10 worn looks — used as the 'don't recycle these' signal
      // so the user gets fresh combinations across sessions.
      supabase
        .from("recent_outfits")
        .select("item_ids")
        .order("date", { ascending: false })
        .limit(10),
    ]);

    if (itemsRes.error) {
      return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    }

    const items = (itemsRes.data ?? []) as ClothingItem[];
    const prefs = prefsRes.data;
    const favoriteOutfits = outfitsRes.data ?? [];

    // Gender track — Track A (women + not-specified) uses the standard
    // styling logic. Track B (men) gets traditional men's silhouettes:
    // bag is optional, office bans shorts/sandals, masculine-coded tone.
    const gender: "woman" | "man" | "not-specified" =
      prefs?.gender === "man" ? "man" : prefs?.gender === "not-specified" ? "not-specified" : "woman";
    const isMensTrack = gender === "man";
    const recentItemSets = (recentRes.data ?? []) as { item_ids: string[] }[];

    if (items.length < 3) {
      return NextResponse.json({
        suggestions: [],
        message: "Add at least 3 items to get outfit suggestions",
      });
    }

    // Daily-cap gate — all free early-exits have passed; from here on
    // the request does real AI work.
    capCount = await consumeDailyCap(countKey);
    if (!isAdmin && capCount > SUGGEST_DAILY_CAP) {
      return NextResponse.json(
        {
          error: "daily_limit_reached",
          limit: SUGGEST_DAILY_CAP,
          // Clamped — the raw counter keeps growing with rejected
          // attempts, which made the client copy over-report usage.
          used: Math.min(capCount, SUGGEST_DAILY_CAP),
        },
        { status: 429 }
      );
    }

    // Weather: saved location → IP geolocation (Vercel headers) → none.
    // The old hardcoded Paris fallback fed the DETERMINISTIC warmth
    // gates wrong-hemisphere temperatures for any user without a saved
    // city (audit C10) — honest "no weather" (gates skip) beats
    // confidently filtering a Québec wardrobe against Paris in January.
    let weather: WeatherData | null = null;
    let weatherSource: "prefs" | "ip" | "none" = "none";
    try {
      const location = prefs?.location;
      if (location?.lat && location?.lng) {
        weather = await getWeather(location.lat, location.lng);
        weatherSource = "prefs";
      } else {
        const ipLat = parseFloat(request.headers.get("x-vercel-ip-latitude") ?? "");
        const ipLng = parseFloat(request.headers.get("x-vercel-ip-longitude") ?? "");
        if (Number.isFinite(ipLat) && Number.isFinite(ipLng)) {
          weather = await getWeather(ipLat, ipLng);
          weatherSource = "ip";
        }
      }
    } catch {
      weather = null;
      weatherSource = "none";
      // proceed without weather — every warmth gate skips
    }

    const currentSeason = getSeasonFromMonth(new Date().getMonth() + 1);
    // Mood / occasion labels are looked up early so Stage 1 (the
    // wardrobe curator) can reference them. Stage 2 reuses these.
    const moodInfo = MOOD_CONFIG[mood];
    const occasionLabel = OCCASION_LABELS[occasion];

    // Favorite-sampling rules to prevent aesthetic lock-in:
    //   - 0 to 3 favorites: skip the favorites block entirely (too small
    //     a sample to represent taste; one "I favorited the first look I
    //     saw" entry would anchor every future suggestion).
    //   - exactly 4: include all 4 (sampling would always drop one and
    //     give the AI an incomplete picture at this size).
    //   - 5 or more: randomly sample 3 per call, so the reference set
    //     varies between calls and every favorite eventually rotates in.
    const allFavorites = favoriteOutfits
      .map((o) => {
        const outfitItems = (o.item_ids as string[])
          .map((id: string) => items.find((i) => i.id === id))
          .filter(Boolean) as ClothingItem[];
        return {
          items: outfitItems.map((i) => `${i.name} (${i.category})`).join(" + "),
          mood: o.mood,
          occasion: o.occasions?.[0] ?? null,
          weather_temp: o.weather_temp,
          source: o.source,
          style_notes: o.style_notes ?? null,
        };
      })
      .filter((f) => f.items.length > 0);

    let favorites: typeof allFavorites;
    if (allFavorites.length < 4) {
      favorites = [];
    } else if (allFavorites.length === 4) {
      favorites = allFavorites;
    } else {
      // Fisher-Yates shuffle + take 3 so we sample a different subset
      // each call. Randomness happens on the server per request.
      const shuffled = [...allFavorites];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      favorites = shuffled.slice(0, 3);
    }

    // Pre-filter the wardrobe shown to the AI. Three independent
    // filters layer on top of each other; an item is "appropriate for
    // this context" only if it passes all three. When a category has
    // 3+ items passing every filter, off-context items in that
    // category get hidden from the AI entirely. Sparse categories
    // (fewer than 3 fully-matching items) show ALL items so the AI
    // has something to work with.
    //
    // Filter 1: occasion + season tags (Rule 17 — user's explicit
    // intent, takes priority).
    // Filter 2: formality bucket — each occasion has an expected
    // formality range (work = business / smart-casual / formal;
    // brunch = casual / smart-casual; etc). Items with formality
    // outside that range get filtered out.
    // Filter 3: weather warmth — at warm temps, hide heavy pieces
    // (warmth ≥ 4) on outerwear and tops; at very-cold temps, hide
    // thin pieces (warmth ≤ 1.5) on outerwear, tops, and dresses.
    function passesTags(it: ClothingItem): boolean {
      const occOK =
        !it.occasions || it.occasions.length === 0 || it.occasions.includes(occasion);
      const seasonOK =
        !it.seasons || it.seasons.length === 0 || it.seasons.includes(currentSeason);
      return occOK && seasonOK;
    }
    const OCCASION_FORMALITY_BANDS: Record<Occasion, string[]> = {
      "at-home": ["very-casual", "casual"],
      casual: ["very-casual", "casual", "smart-casual"],
      brunch: ["casual", "smart-casual"],
      outdoor: ["very-casual", "casual"],
      travel: ["very-casual", "casual", "smart-casual"],
      work: ["smart-casual", "business-casual", "formal"],
      "dinner-out": ["smart-casual", "business-casual", "formal"],
      date: ["smart-casual", "business-casual", "formal"],
      party: ["smart-casual", "business-casual", "formal"],
      formal: ["business-casual", "formal"],
    };
    const allowedFormalities = new Set(OCCASION_FORMALITY_BANDS[occasion] ?? []);
    function passesFormality(it: ClothingItem): boolean {
      const formalities = Array.isArray(it.formality) ? it.formality : [it.formality];
      // No formality tagged on this item — show it (no signal to filter on).
      if (!formalities.length || formalities.every((f) => !f)) return true;
      // User-tag override: if the user explicitly tagged this item for
      // the current occasion, their intent wins over the generic
      // formality band. Same pattern as the work / sneakers + jeans
      // overrides in the main filter — the user knows their workplace
      // / dress-code reality better than our enum bands do.
      if ((it.occasions ?? []).includes(occasion)) return true;
      return formalities.some((f) => f && allowedFormalities.has(f));
    }
    const temp = weather && typeof weather.temp === "number" ? weather.temp : null;
    function passesWarmth(it: ClothingItem): boolean {
      if (temp === null) return true;
      const warmth = it.warmth_rating ?? null;
      // Hot (≥25°C) — block mid-weight long-sleeves, jeans, sweaters,
      // heavy bottoms, heavy footwear, and tall-shaft boots. Previously
      // the only cutoff was warmth ≥4 on tops, which let mid-weight
      // cotton long-sleeves and any boot pass through at 27°C. The
      // base-layer gate is warmth ≤2 to qualify; outerwear is fully
      // blocked; shoes need warmth ≤3 (sandals, espadrilles, light
      // sneakers, ballet flats) AND must not be knee/over-knee
      // height — wool-lined boots and tall-shaft boots read winter
      // even when the warmth tag is forgiving.
      if (temp >= 25) {
        if (it.category === "outerwear") return false;
        if (
          (it.category === "top" ||
            it.category === "bottom" ||
            it.category === "dress" ||
            it.category === "one-piece") &&
          warmth !== null &&
          warmth >= 3
        ) {
          return false;
        }
        if (it.category === "shoes") {
          if (warmth !== null && warmth >= 4) return false;
          if (it.subcategory === "knee-boots") return false;
          if (it.shoe_height === "knee" || it.shoe_height === "over-knee") {
            return false;
          }
        }
      }
      // Warm-to-mild (18–25°C) — block genuinely heavy outerwear and
      // heavy tops (warmth ≥4). At 18°C a chunky wool sweater or
      // double-breasted coat is already too much; blocking them here
      // prevents the AI from defaulting to winter staples on a
      // shoulder-season morning when the wardrobe also has lighter
      // options. Mid-weight (warmth 2-3) pieces stay available.
      if (temp >= 18 && temp < 25) {
        if (
          (it.category === "outerwear" || it.category === "top") &&
          warmth !== null &&
          warmth >= 4
        ) {
          return false;
        }
      }
      // Mild-cool (10–14°C) — the audit found this band had NO gate at
      // all (the most common shoulder-season temperatures!), letting
      // tank tops and sandals through at 11°C. Gate the true summer-only
      // pieces: ultralight bases (warmth ≤1) and open-toe shoes. 14–18°C
      // intentionally stays un-gated — mid-spring sandals are a
      // legitimate choice there.
      if (temp >= 10 && temp < 14) {
        if (
          (it.category === "top" ||
            it.category === "dress" ||
            it.category === "one-piece") &&
          warmth !== null &&
          warmth <= 1
        ) {
          return false;
        }
        if (it.category === "shoes") {
          if (it.subcategory === "sandals") return false;
          if (it.toe_shape === "open-toe" || it.toe_shape === "peep-toe") {
            return false;
          }
        }
      }
      // Cool (5–10°C) — block thin upper layers (warmth ≤1.5 on tops,
      // dresses, one-piece) and open-toe shoes. At 7°C a tank top or
      // summer dress isn't realistic even under a coat; the prompt's
      // "base warmth ≥2 at <10°C" rule wants this enforced. Bottoms
      // stay un-gated here (a jean skirt with tights at 8°C is fine);
      // they only get the thin-block at the <5°C tier below.
      if (temp >= 5 && temp < 10) {
        if (
          (it.category === "top" ||
            it.category === "dress" ||
            it.category === "one-piece") &&
          warmth !== null &&
          warmth <= 1.5
        ) {
          return false;
        }
        if (it.category === "shoes") {
          if (it.subcategory === "sandals") return false;
          if (it.toe_shape === "open-toe" || it.toe_shape === "peep-toe") {
            return false;
          }
        }
      }
      // Very cold (<5°C) — block thin pieces on every base-layer
      // category (not just tops / dresses — the previous gate let
      // shorts and summer jumpsuits through at -5°C). Also block
      // open-toe shoes and sandals — never appropriate in freezing
      // weather even if the user happens to own them.
      if (temp < 5) {
        if (
          (it.category === "outerwear" ||
            it.category === "top" ||
            it.category === "bottom" ||
            it.category === "dress" ||
            it.category === "one-piece") &&
          warmth !== null &&
          warmth <= 1.5
        ) {
          return false;
        }
        if (it.category === "shoes") {
          if (it.subcategory === "sandals") return false;
          if (it.toe_shape === "open-toe" || it.toe_shape === "peep-toe") {
            return false;
          }
        }
      }
      return true;
    }
    const RICH_CATEGORY_THRESHOLD = 3;
    const inAllByCategory = new Map<string, number>();
    for (const it of items) {
      if (it.is_stored) continue;
      if (passesTags(it) && passesFormality(it) && passesWarmth(it)) {
        inAllByCategory.set(it.category, (inAllByCategory.get(it.category) ?? 0) + 1);
      }
    }
    const promptItems = items.filter((it) => {
      if (it.is_stored) return false;
      // Hard-rule pre-filters that should be applied before the AI
      // sees the wardrobe at all — keeps the AI from anchoring on an
      // item it can never use. The matching post-parse rules still
      // run in case the AI references a stripped item by id anyway.
      // R9: no athletic sneakers at work, no denim bottoms at work —
      // UNLESS the user explicitly tagged the item for "work" (their
      // workplace allows it; user judgment overrides the generic rule).
      if (occasion === "work") {
        const userApproved = (it.occasions ?? []).includes("work");
        if (!userApproved) {
          if (it.category === "shoes" && it.subcategory === "sneakers") return false;
          if (it.category === "bottom" && it.subcategory === "jeans") return false;
        }
      }
      // At-home: you are INDOORS. Strip categories that don't make
      // sense in your living room from the candidate pool entirely so
      // the AI can't propose them.
      //   - Bag: nowhere to go (R7).
      //   - Outerwear: indoors, no need for a coat / jacket / blazer.
      //   - Shoes: barefoot / socks / slippers — even indoor-friendly
      //     shoes (sandals, flats) read as "going out" when paired
      //     with the rest of the outfit.
      if (occasion === "at-home" && it.category === "bag") return false;
      if (occasion === "at-home" && it.category === "outerwear") return false;
      if (occasion === "at-home" && it.category === "shoes") return false;
      if (occasion === "at-home" && it.category === "accessory") return false;
      const richCategory =
        (inAllByCategory.get(it.category) ?? 0) >= RICH_CATEGORY_THRESHOLD;
      if (!richCategory) return true;
      return passesTags(it) && passesFormality(it) && passesWarmth(it);
    });

    // EXPERIMENT 2026-05-08: removed weighted-random subsetting. The
    // sampler had been capping the AI's view at ~38 items across
    // categories, biased toward less-worn pieces. Symptom in beta:
    // outputs felt repetitive — same items kept resurfacing because
    // the AI never saw the rest of the wardrobe per call. Now we hand
    // the full pre-filtered pool to the AI and let it choose. Cost
    // increase is marginal (~$0.003/call extra input tokens for a
    // 200-item wardrobe). Revert by restoring the SUBSET_TARGETS /
    // itemSampleWeight block from git history if the model gets
    // overwhelmed by choice and outputs feel safer / more
    // conservative.
    const fullPool: ClothingItem[] = [...promptItems];
    // Anchor safety net: if the user pinned an anchor item via STYLE
    // DIRECTION and it got filtered out by a pre-filter (off-season,
    // wrong-occasion tag, etc.), inject it back so the AI can still
    // build the requested outfit around it.
    if (anchorItemId) {
      const anchor = items.find((i) => i.id === anchorItemId && !i.is_stored);
      if (anchor && !fullPool.some((s) => s.id === anchor.id)) {
        fullPool.push(anchor);
      }
    }

    // Hard exclusion of recently-shown ANCHOR items so "Show me
    // another" returns a genuinely new outfit, not a re-shuffle of
    // the same look. Anchors (the pieces that define an outfit:
    // dress, top, bottom, outerwear, jumpsuit, overalls) are banned
    // for EXCLUSION_DEPTH outfits. Accessories (bag, shoes,
    // accessory) are NOT banned — versatile pieces like a great
    // handbag SHOULD recur across outfits because that's how real
    // styling works. EXCLUSION_DEPTH = 10 covers any realistic "Show
    // me another" session before items rotate back. Wardrobe-aware
    // threshold + zero-count restore prevent empty results.
    const EXCLUSION_DEPTH = 10;
    const ANCHOR_CATEGORIES = new Set([
      "dress",
      "top",
      "bottom",
      "outerwear",
      "one-piece",
    ]);
    const previousOutfitIds = Array.from(
      new Set(kvRecentSuggestions.slice(0, EXCLUSION_DEPTH).flat())
    );
    if (previousOutfitIds.length > 0) {
      const wardrobeCategoryCounts = items.reduce<Record<string, number>>(
        (acc, i) => {
          if (!i.is_stored) acc[i.category] = (acc[i.category] ?? 0) + 1;
          return acc;
        },
        {}
      );
      const RICH_ENOUGH = 3;
      const banSet = new Set<string>();
      for (const id of previousOutfitIds) {
        if (anchorItemId && id === anchorItemId) continue;
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        // Skip non-anchor categories — accessories are allowed to recur.
        if (!ANCHOR_CATEGORIES.has(item.category)) continue;
        if ((wardrobeCategoryCounts[item.category] ?? 0) >= RICH_ENOUGH) {
          banSet.add(id);
        }
      }
      if (banSet.size > 0) {
        const beforeCount = fullPool.length;
        const filtered = fullPool.filter((it) => !banSet.has(it.id));
        // Replace fullPool only if filter didn't blow up a category
        // worse than wardrobe-thin: if for some reason ALL items in a
        // category got banned (shouldn't happen given the threshold
        // check but defend anyway), restore that category's items.
        const filteredByCat = filtered.reduce<Record<string, number>>(
          (acc, i) => {
            acc[i.category] = (acc[i.category] ?? 0) + 1;
            return acc;
          },
          {}
        );
        const restored = [...filtered];
        for (const it of fullPool) {
          if (!banSet.has(it.id)) continue;
          if ((filteredByCat[it.category] ?? 0) === 0) {
            restored.push(it);
          }
        }
        fullPool.length = 0;
        fullPool.push(...restored);
        if (fullPool.length < beforeCount) {
          console.log(
            `[suggest] excluded ${beforeCount - fullPool.length} items from previous outfit`
          );
        }
      }
    }

    const wardrobeList = fullPool.map(describeItem).join("\n");

    const weatherDesc = weather
      ? `${weather.temp}°C, feels like ${weather.feels_like}°C. ${weather.condition}. Humidity: ${weather.humidity}%, wind: ${weather.wind_speed}km/h, rain chance: ${weather.precipitation_probability}%.`
      : "Weather data unavailable.";

    const favoritesSection = favorites.length > 0
      ? `\n\nUSER'S FAVORITE OUTFITS (learn from these - they represent the user's style preferences). The "saved at" temperature shown for each is the weather when the user favorited the outfit — give MORE weight to favorites whose saved-at temperature is within ±5°C of TODAY'S temperature, since those represent the user's preferences for the kind of weather they're actually dressing for now. Favorites saved at very different temperatures still inform style/colour/silhouette taste but don't directly map to today's outfit.\n${favorites.map((f, i) => `${i + 1}. ${f.items}${f.mood ? ` | Mood: ${f.mood}` : ""}${f.occasion ? ` | Occasion: ${f.occasion}` : ""}${f.weather_temp !== null ? ` | saved at ${f.weather_temp}°C` : ""}${f.source === "manual" ? " (manually created)" : ""}${f.style_notes ? `\n   Note from user: "${f.style_notes}"` : ""}`).join("\n")}`
      : "";

    // Anti-repetition signal: combine KV-tracked recent SUGGESTIONS (across
    // "Suggest" clicks in the last 12h) with worn looks from recent_outfits.
    // Together they stop the model from recycling the same 3 pairings.
    const allRecentSets: string[][] = [
      ...kvRecentSuggestions,
      ...recentItemSets.map((r) => r.item_ids),
    ];
    const recentSection = allRecentSets.length > 0
      ? `\n\nRECENTLY SHOWN OR WORN (item-id sets the user has already seen — your outfit MUST differ from every one of these by at least 2 items):\n${allRecentSets.map((ids, i) => `${i + 1}. [${ids.join(", ")}]`).join("\n")}`
      : "";

    // CACHE LAYOUT (audit B4): the prompt is split so Gemini's implicit
    // prefix caching actually bites. Order: [persona + full static rules
    // + output contract] → [wardrobe] → suffix[per-request context].
    // The old layout put the ~6K-token rules block in the suffix AFTER
    // the per-tap nonce, guaranteeing it was re-processed on every
    // single call; and the per-call-sampled favorites lived in the
    // prefix, breaking byte-identity between taps. Rules-first means
    // the largest static block now caches across every request on the
    // same track+locale, and the wardrobe segment caches across taps
    // whenever the pool didn't change.
    const staticRulesBlock = buildStaticRulesBlock({ isMensTrack, languageName });
    const cachedPrefix = `You are Linette, a sharp personal stylist with a strong point of view. Your job is to MAKE OUTFITS INTERESTING, not just compliant.

PRIMARY DIRECTIVES (read before any rule):
- VOICE: every string you write (name, reasoning, styling_tip, wardrobe_gap) speaks DIRECTLY to the wearer in second person — "you" in English, "tu" in French. NEVER write "the user", "the wearer", "she", "he", "they", or any third-person reference to the person wearing the outfit. You are addressing them, not describing them to someone else. CRITICAL for French: use ONLY the informal "tu" form — "tu", "ton", "ta", "tes", and imperative verbs in tu form ("rentre", "ajoute", "porte"). NEVER use "vous", "votre", "vos", or vous-form imperatives ("rentrez", "ajoutez", "portez"). The user signed up for a personal stylist friend, not a department store concierge.
- OUTPUT LANGUAGE: every string field in your JSON response (name, reasoning, styling_tip, wardrobe_gap) MUST be written entirely in ${languageName}. Do not mix languages, do not slip into another language for any field, do not let the language of item names in the wardrobe list bias your output. If ${languageName} is English, every word you produce in those fields is English. If ${languageName} is French, every word is French.
- Every outfit needs ONE focal point — a piece that catches the eye. Color, pattern, texture, shine, or silhouette. Bland-and-correct is a fail; bland-and-correct without a single visual hook means you stopped thinking too soon.
- A real stylist FINISHES the look. If a sweater + skirt would obviously be belted in real life, ADD the belt (within Rule 18a's never-belt exceptions). If a coat over jeans would obviously have a scarf, ADD the scarf (within Rule 15's proximity limits). Don't stop at the minimum.
- This is ONE outfit, generated independently each time the user taps "Show me another." Don't worry about variety across multiple outputs — the RECENTLY SHOWN list shows what's already been served, so just pick a fresh combination that differs from those.
- Items tagged "Favorited" in the wardrobe list are pieces the wearer especially loves. Give them a soft preference when they fit the brief, but don't force them — an outfit that's wrong for the occasion or doesn't make stylistic sense is worse than one that skips a favorite.

The hard rules below exist to prevent visually wrong choices. They do NOT excuse boring choices. Build the outfit a stylist would build, then check it against the rules — not the other way around.

${staticRulesBlock}

WARDROBE:
${wardrobeList}`;

    // Variation nonce in the dynamic suffix only — keeps the cached prefix
    // hot while giving Claude a different starting context so we don't get
    // the same three outfits every call.
    const iterationNonce = `iter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Temperature-sensitivity preference: shifts the AI's perceived
    // weather so a "runs hot" person doesn't get a coat at 12°C and a
    // "runs cold" person isn't sent out in shirtsleeves at 18°C.
    // Qualitative ~3°C shift — meaningful enough to cross the prompt's
    // weather bands (cold <12°C / mild 12-22°C / warm >22°C).
    const sensitivity = prefs?.temperature_sensitivity ?? "normal";
    const sensitivityLine =
      sensitivity === "runs-hot"
        ? "USER PREFERENCE: runs HOT — treat the temperature as ~3°C warmer than reported. Skip outerwear unless temp is genuinely cold (<9°C). Avoid heavy knits/wool unless <12°C. Lean lighter."
        : sensitivity === "runs-cold"
        ? "USER PREFERENCE: runs COLD — treat the temperature as ~3°C cooler than reported. Require outerwear at <15°C (not <12°C). Layer earlier. Avoid sandals until >25°C. Lean warmer."
        : "";

    // recentSection lives in the DYNAMIC suffix, not the cached prefix.
    // Each "Show me another" tap appends one more entry to the recent-
    // shown list; if that grew inside cachedPrefix, the byte-identical
    // prompt-prefix requirement for Gemini's prompt cache would be
    // violated on every tap (tap 1 vs tap 2 vs tap 3 = three different
    // prefixes), causing a full uncached re-process every time. Beta
    // user reported "the third Show me another feels like forever" —
    // that's the cache miss showing up. Moving it down here keeps the
    // wardrobe + rules portion ~constant across taps so the cache
    // actually hits, and only the small variable-state delta is
    // re-processed each call.
    const dynamicSuffix = `

WEATHER: ${weatherDesc}
SEASON: ${currentSeason}
MOOD (apply Rule 13 — every outfit must visibly express this): ${moodInfo.label} — ${moodInfo.description}
OCCASION: ${occasionLabel}${styleWishes.length > 0 ? `\nSTYLE DIRECTION: ${styleWishes.join(", ")}` : ""}${anchorItemId ? `\nANCHOR ITEM: Every outfit MUST include item id [${anchorItemId}].` : ""}${sensitivityLine ? `\n${sensitivityLine}` : ""}${favoritesSection}${recentSection}
ITERATION: ${iterationNonce}

Return ONE deliberate complete outfit from the wardrobe, following the HARD RULES and output format defined above. It must differ from every set in RECENTLY SHOWN OR WORN by at least 2 items. Spend your full reasoning on this single composition — focal point, color story, texture interplay, finishing touches. No throwaway picks. This is the user's only outfit for this tap; if it's mediocre they'll feel it.`;


    // Gemini constrained decoding (responseSchema) instead of asking for
    // raw JSON in a text response. Free-form JSON was failing to parse
    // ~30% of the time because the model slipped unescaped quotes /
    // dashes into the reasoning and styling_tip strings; schema-
    // constrained output keeps the shape parseable.
    type ParsedShape = {
      outfits?: {
        item_ids: string[];
        name?: string;
        reasoning?: string | null;
        styling_tip?: string | null;
      }[];
      wardrobe_gap?: string | null;
    };
    async function callAi(
      extraSuffix = ""
    ): Promise<{ parsed: ParsedShape | null; stopReason: string | null }> {
      // Gemini 3.5 Flash with SHALLOW thinking (thinkingBudget: 3072) +
      // single-outfit generation. Variety across "Show me another"
      // taps comes from the RECENTLY SHOWN ban list; quality comes
      // from the model's full attention on one composition rather
      // than splitting across competing candidates. extraSuffix carries
      // the regenerate-with-feedback block on the second validation pass.
      const result = await withGeminiRetry(
        () =>
          genAI.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `${cachedPrefix}\n\n${dynamicSuffix}${extraSuffix}`,
            config: {
              temperature: 1,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
              responseSchema: SUGGEST_RESPONSE_SCHEMA,
              thinkingConfig: { thinkingBudget: 3072 },
            },
          }),
        { tag: "suggest" }
      );
      const stopReason = result.candidates?.[0]?.finishReason ?? null;
      const text = result.text;
      if (!text) {
        return { parsed: null, stopReason: stopReason ?? null };
      }
      try {
        return {
          parsed: JSON.parse(text) as ParsedShape,
          stopReason: stopReason ?? null,
        };
      } catch (err) {
        console.error(
          "[suggest] Failed to parse Gemini JSON:",
          err,
          text.slice(0, 200)
        );
        return { parsed: null, stopReason: stopReason ?? null };
      }
    }

    // Two attempts on bad shape. With single-outfit mode + thinking
    // on, a truncated JSON or empty outfit list means we'd ship zero
    // suggestions to the UI. One automatic retry hides transient
    // hiccups — if the second attempt also fails, we surface a clear
    // "ai_error" flag so the UI shows "try again" instead of the
    // misleading "not enough items" empty state.
    let r = await callAi();
    if (!r.parsed || !Array.isArray(r.parsed.outfits) || r.parsed.outfits.length === 0) {
      console.warn(
        `[suggest] first attempt empty/bad shape; stop=${r.stopReason} — retrying once`
      );
      r = await callAi();
    }
    const parsed = r.parsed;
    if (!parsed || !Array.isArray(parsed.outfits)) {
      console.error(
        `[suggest] AI returned unexpected shape after retry; stop=${r.stopReason}`,
        parsed
      );
      if (capCount !== null && capCount !== -1) refundDailyCap(countKey);
      return NextResponse.json({
        suggestions: [],
        ai_error: true,
        message: `AI returned an unexpected shape — stop=${r.stopReason}`,
      });
    }
    const parsedOutfits = parsed.outfits;

    // Strip material / silhouette words from an AI-written name only
    // when no item in the outfit actually has that attribute. The AI
    // sometimes writes "Suede & Satin Edge" when there's no suede; we
    // scrub the hallucinated half but keep the legit half ("Satin Edge"
    // when a satin dress is in the outfit). Falls back to a generic
    // label only when the cleaned name comes out empty.
    const NAME_STRIP_VOCAB = [
      "suede", "satin", "silk", "leather", "denim", "wool", "cotton",
      "linen", "knit", "mesh", "lace", "velvet", "corduroy", "tweed",
      "cashmere", "chiffon", "fleece", "flannel", "jersey", "tulle",
      "faux-leather", "faux-suede", "patent-leather",
      "moto", "biker", "bomber",
      "maxi", "midi", "mini", "crop", "cropped",
      "flared", "skinny", "slim", "oversized", "tapered", "bootcut",
      "wide-leg",
    ];
    const buildPermittedVocab = (its: ClothingItem[]): Set<string> => {
      const set = new Set<string>();
      const add = (v: unknown) => {
        if (typeof v === "string" && v.length > 0) set.add(v.toLowerCase());
      };
      for (const i of its) {
        add(i.subcategory);
        add(i.fit);
        add(i.bottom_fit);
        add(i.dress_silhouette);
        add(i.skirt_length);
        add(i.length);
        add(i.pants_length);
        if (Array.isArray(i.material)) for (const m of i.material) add(m);
      }
      return set;
    };
    const cleanName = (
      raw: string | undefined,
      fallback: string,
      its: ClothingItem[]
    ): string => {
      if (!raw) return fallback;
      const permitted = buildPermittedVocab(its);
      let cleaned = raw;
      for (const w of NAME_STRIP_VOCAB) {
        if (permitted.has(w)) continue;
        // Match the bare word and either spaced or hyphenated variants
        // (so "wide-leg" handles "wide leg" too).
        const escaped = w.replace(/-/g, "(?:-|\\s)");
        const re = new RegExp(`\\b${escaped}s?\\b`, "gi");
        cleaned = cleaned.replace(re, "");
      }
      cleaned = cleaned
        .replace(/\s+/g, " ")
        .replace(/\s*([&+,])\s*/g, " $1 ")
        .replace(/^\s*[&+,]+\s*|\s*[&+,]+\s*$/g, "")
        .replace(/^(?:and|et)\s+/i, "")
        .trim();
      return cleaned.length >= 3 ? cleaned : fallback;
    };


    // ——— Context shared by the map-phase injectors AND the post-parse
    // validators. Hoisted above `mapped` so injectors can't create
    // violations the validators then punish (mixed metals, non-dark
    // items on an all-black request, suede coats in rain).

    // Detect preset wishes from the user's STYLE DIRECTION text. The
    // model is told these are hard rules but doesn't always honor them —
    // we enforce post-parse so non-compliant outfits get dropped.
    const wishText = styleWishes.join(" ").toLowerCase();
    const wantsAllBlack = /all[ -]?black|tout en noir/i.test(wishText);
    const wantsDressDay = /dress[ -]?day|journ[ée]e robe/i.test(wishText);
    const wantsMixPatterns = /mix[ -]?patterns?|mixer les motifs/i.test(wishText);
    // Denim-on-denim opt-in: lifts the soft restriction in Rule 4c.
    const wantsDenimOnDenim =
      /full[ -]?denim|all[ -]?denim|double[ -]?denim|denim[ -]?on[ -]?denim|canadian[ -]?tuxedo|tout en denim|total denim|denim sur denim/i.test(
        wishText
      );

    // Hex-based "is this item dark/near-black?" check. Accepts items
    // whose primary color is named black/jet/onyx/charcoal OR whose
    // hex sum is below ~90 (avg <30 per channel — true black-to-charcoal
    // band, excludes navy and dark brown which read as colors).
    function isDarkItem(item: { colors: { hex: string; name: string }[] }): boolean {
      const primary = item.colors?.[0];
      if (!primary) return false;
      const name = (primary.name ?? "").toLowerCase();
      if (/black|jet|onyx|noir|ebony|obsidian|raven/.test(name)) return true;
      const m = /^#?([0-9a-f]{6})$/i.exec((primary.hex ?? "").trim());
      if (!m) return false;
      const n = parseInt(m[1], 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return r + g + b < 90;
    }

    // Rain trigger — outfit-independent, shared by the rain validators
    // and the outerwear injector (which must not inject a suede coat the
    // rain rule would then hard-drop).
    const rainTriggered =
      weather &&
      ((typeof weather.precipitation_probability === "number" &&
        weather.precipitation_probability >= 40) ||
        (typeof weather.condition === "string" &&
          /rain|shower/i.test(weather.condition)));
    const RAIN_BLOCK_MATERIALS = new Set<string>(["suede", "silk", "satin", "canvas"]);
    const rainBlocked = (i: ClothingItem) => {
      const mats = Array.isArray(i.material) ? i.material : [i.material];
      return mats.some((m) => m && RAIN_BLOCK_MATERIALS.has(m));
    };

    // Metal families — shared by the metal-sync validator and the
    // injector candidate filter.
    const GOLD_FAMILY = new Set(["gold", "rose-gold", "matte-gold", "brass", "bronze"]);
    const SILVER_FAMILY = new Set(["silver", "chrome", "matte-silver", "gunmetal"]);
    const metalFamilyOf = (i: ClothingItem): "gold" | "silver" | "other" | null => {
      const finish = i.category === "bag" ? i.bag_metal_finish : i.metal_finish;
      if (!finish || finish === "none" || finish === "mixed") return null;
      return GOLD_FAMILY.has(finish) ? "gold" : SILVER_FAMILY.has(finish) ? "silver" : "other";
    };

    // Candidate picker for the shoe / bag / accessory injectors. Order of
    // preference: occasion-tagged > preset-compatible > metal-compatible.
    // For OPTIONAL slots (bag, accessory) a preset conflict returns null —
    // skipping the injection beats creating a violation that hard-drops
    // the whole outfit. For REQUIRED slots (shoes) the preference filters
    // degrade gracefully instead of returning null: a preset-breaking shoe
    // and a missing shoe both drop the outfit downstream, so we prefer
    // the more complete-looking result.
    const pickInjectionCandidate = (
      pool: ClothingItem[],
      current: ClothingItem[],
      required: boolean
    ): ClothingItem | null => {
      if (pool.length === 0) return null;
      const occasionMatches = pool.filter(
        (c) => Array.isArray(c.occasions) && c.occasions.includes(occasion as Occasion)
      );
      let candidates = occasionMatches.length > 0 ? occasionMatches : pool;
      if (wantsAllBlack) {
        const dark = candidates.filter(isDarkItem);
        if (dark.length > 0) candidates = dark;
        else if (!required) return null;
      }
      if (mood !== "playful") {
        const families = new Set(
          current
            .map(metalFamilyOf)
            .filter((f): f is "gold" | "silver" => f === "gold" || f === "silver")
        );
        if (families.size === 1) {
          const fam = [...families][0];
          const compatible = candidates.filter((c) => {
            const f = metalFamilyOf(c);
            return f === null || f === fam;
          });
          if (compatible.length > 0) candidates = compatible;
          else if (!required) return null;
        }
      }
      return candidates[0];
    };

    type ParsedOutfit = NonNullable<ParsedShape["outfits"]>[number];
    const buildOutfit = (s: ParsedOutfit) => {
      const rawItems = s.item_ids
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as ClothingItem[];

      const fixes: string[] = [];

      // R12 ANCHOR — the prompt says "MUST include [anchor]" but nothing
      // enforced it post-parse, so a pinned item could silently vanish.
      // Re-inject it FIRST in the list (the keep-first dedupes below then
      // prefer it over a same-slot rival). If the anchor is a base piece
      // and the model picked a conflicting dress/jumpsuit instead, the
      // anchor wins — drop the conflicting piece so the dress/top strips
      // below don't remove the anchor itself.
      let anchored = rawItems;
      if (anchorItemId && !rawItems.some((i) => i.id === anchorItemId)) {
        const anchor = items.find(
          (i) => i.id === anchorItemId && !i.is_stored
        );
        if (anchor) {
          let rest = rawItems;
          if (anchor.category === "bottom") {
            rest = rest.filter(
              (i) => i.category !== "dress" && i.category !== "one-piece"
            );
          } else if (
            anchor.category === "top" &&
            !anchor.is_layering_piece &&
            anchor.subcategory !== "cardigan"
          ) {
            // Keep a slip dress only when the anchor top can layer under
            // it (mirrors isAllowedUnderSlip below) — otherwise the
            // dress/top strip would re-remove the anchor.
            const anchorFitsUnderSlip =
              (anchor.fit === "slim" || anchor.fit === "regular") &&
              anchor.subcategory !== "hoodie" &&
              anchor.subcategory !== "sweater";
            rest = rest.filter(
              (i) =>
                !(
                  i.category === "dress" &&
                  !(i.dress_silhouette === "slip" && anchorFitsUnderSlip)
                ) &&
                !(i.category === "one-piece" && i.subcategory !== "overalls")
            );
          }
          anchored = [anchor, ...rest];
          fixes.push("re-injected missing anchor item");
        }
      }

      // Auto-fix fixable structural violations instead of dropping outfits.
      // The AI routinely breaks the "dress + top/bottom" and "max one per
      // subcategory" rules despite the prompt; dropping those outfits was
      // starving the UI (sometimes 0 outfits reached the user). Silent
      // strip keeps the outfit alive; the hybrid text validator still
      // swaps in template prose when the AI's description references
      // stripped items.
      const rawHasDress = anchored.some((i) => i.category === "dress");
      const rawHasJumpsuit = anchored.some(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      const rawHasOnePiece = anchored.some((i) => i.category === "one-piece");

      let stripped = anchored;
      // Strip bottoms when a dress or one-piece is present.
      if ((rawHasDress || rawHasOnePiece) && stripped.some((i) => i.category === "bottom")) {
        stripped = stripped.filter((i) => i.category !== "bottom");
        fixes.push("stripped bottom (dress/jumpsuit present)");
      }
      // Strip non-layering tops when a dress or non-overalls jumpsuit is
      // present. EXCEPTION: a slip-silhouette dress can be styled with a
      // slim/regular fitted top underneath — keep those.
      const rawSlipDress = anchored.some(
        (i) => i.category === "dress" && i.dress_silhouette === "slip"
      );
      const isAllowedUnderSlip = (i: ClothingItem) =>
        i.category === "top" &&
        !i.is_layering_piece &&
        i.subcategory !== "cardigan" &&
        i.subcategory !== "hoodie" &&
        i.subcategory !== "sweater" &&
        (i.fit === "slim" || i.fit === "regular");
      if ((rawHasDress || rawHasJumpsuit) && stripped.some(
        (i) => i.category === "top" && !i.is_layering_piece && i.subcategory !== "cardigan"
        && !(rawSlipDress && isAllowedUnderSlip(i))
      )) {
        stripped = stripped.filter(
          (i) =>
            i.category !== "top" ||
            i.is_layering_piece ||
            i.subcategory === "cardigan" ||
            (rawSlipDress && isAllowedUnderSlip(i))
        );
        fixes.push("stripped non-layering top (dress/jumpsuit present)");
      }
      // Dedupe subcategories — keep first of each.
      {
        const seen = new Set<string>();
        const deduped: ClothingItem[] = [];
        for (const i of stripped) {
          if (i.subcategory && seen.has(i.subcategory)) continue;
          if (i.subcategory) seen.add(i.subcategory);
          deduped.push(i);
        }
        if (deduped.length !== stripped.length) {
          fixes.push("deduped subcategories");
        }
        stripped = deduped;
      }
      // Single-piece categories: shoes / bag / bottom / dress / one-piece
      // — keep at most one item from each. The subcategory dedupe above
      // misses the "one pair of sneakers + one pair of boots" case
      // (different subcategories, both shoes — still wrong).
      {
        const SINGLE_PIECE = new Set<string>(["shoes", "bag", "bottom", "dress", "one-piece"]);
        const seenCat = new Set<string>();
        const dedupedByCat: ClothingItem[] = [];
        for (const i of stripped) {
          if (SINGLE_PIECE.has(i.category) && seenCat.has(i.category)) continue;
          if (SINGLE_PIECE.has(i.category)) seenCat.add(i.category);
          dedupedByCat.push(i);
        }
        if (dedupedByCat.length !== stripped.length) {
          fixes.push("deduped single-piece categories");
        }
        stripped = dedupedByCat;
      }

      // Outerwear pair check — winter layering allows blazer/vest UNDER
      // a long coat (coat/peacoat/trench-coat/parka/puffer). Anything
      // else (two jackets, two coats, denim+leather, etc.) is invalid;
      // strip everything but the outermost.
      {
        const outers = stripped.filter((i) => i.category === "outerwear");
        if (outers.length >= 2) {
          const INNER_OUTERWEAR = new Set<string>(["blazer", "vest"]);
          const OUTER_OUTERWEAR = new Set<string>([
            "coat",
            "peacoat",
            "trench-coat",
            "parka",
            "puffer",
          ]);
          const inner = outers.find((i) => INNER_OUTERWEAR.has(i.subcategory ?? ""));
          const outer = outers.find((i) => OUTER_OUTERWEAR.has(i.subcategory ?? ""));
          const isValidPair = outers.length === 2 && inner && outer;
          if (!isValidPair) {
            // Keep the most "outer" candidate (long coat) if present,
            // otherwise the first item. Strip the rest.
            const keep = outer ?? outers[0];
            const dropped = outers.filter((i) => i.id !== keep.id);
            stripped = stripped.filter(
              (i) => !dropped.some((d) => d.id === i.id)
            );
            fixes.push(
              `stripped ${dropped.length} extra outerwear (kept ${keep.subcategory ?? "outerwear"}; invalid layering pair)`
            );
          }
        }
      }

      // At-home category stripping — mirror the pre-filter as a safety
      // net. The pre-filter excludes bag/outerwear/shoes/accessory from
      // the AI's wardrobe view, BUT the AI can still emit IDs for those
      // categories by referencing the RECENTLY SHOWN list (which carries
      // IDs from earlier non-at-home requests). Without this post-parse
      // strip, those IDs resolve back into real items and end up in the
      // outfit. Strip-instead-of-drop: remove the offender silently
      // rather than killing the whole outfit.
      if (occasion === "at-home") {
        const beforeLen = stripped.length;
        stripped = stripped.filter((i) => {
          if (i.category === "bag") return false;
          if (i.category === "outerwear") return false;
          if (i.category === "shoes") return false;
          if (i.category === "accessory") return false;
          return true;
        });
        if (stripped.length !== beforeLen) {
          fixes.push("stripped at-home offenders (bag/outerwear/shoes/accessory)");
        }
      } else {
        // R15 TURTLENECK + SCARF strip — outside of at-home, allow the
        // pair only when temp <5°C AND the scarf is genuinely functional
        // (warmth >=3 or scarf_function="functional"). Otherwise the
        // scarf is decorative and competes with the turtleneck for the
        // same neck zone — strip it.
        const hasTurtleneck = stripped.some(
          (i) => i.category === "top" && i.neckline === "turtleneck"
        );
        if (hasTurtleneck) {
          const isCold =
            weather &&
            typeof weather.temp === "number" &&
            weather.temp < 5;
          const beforeLen = stripped.length;
          stripped = stripped.filter((i) => {
            if (i.category !== "accessory" || i.subcategory !== "scarf") return true;
            if (isCold) {
              const isFunctional =
                i.scarf_function === "functional" ||
                (i.scarf_function == null && (i.warmth_rating ?? 0) >= 3);
              if (isFunctional) return true;
            }
            return false;
          });
          if (stripped.length !== beforeLen) {
            fixes.push("stripped scarf (turtleneck + temp ≥5°C rule)");
          }
        }
      }

      // WARM-TEMP LAYERING BRAKE — at ≥20°C indoor, an extra cardigan/
      // hoodie stacked over an existing top (or over a dress / overalls
      // base) reads as overdressed. Strip the over-layer; keep the
      // base outfit intact.
      {
        const INDOOR_FOR_LAYERING = new Set<string>([
          "at-home",
          "work",
          "dinner-out",
          "formal",
        ]);
        if (
          weather &&
          typeof weather.temp === "number" &&
          weather.temp >= 20 &&
          INDOOR_FOR_LAYERING.has(occasion)
        ) {
          const tops = stripped.filter((i) => i.category === "top");
          const hasDressOrOnePieceBase = stripped.some(
            (i) => i.category === "dress" || i.category === "one-piece"
          );
          // We only strip an over-layer when there IS one — i.e., 2+
          // tops in the outfit, or a top stacked over a dress/overalls.
          const hasOverLayer =
            tops.length >= 2 || (hasDressOrOnePieceBase && tops.length >= 1);
          if (hasOverLayer) {
            const beforeLen = stripped.length;
            stripped = stripped.filter((i) => {
              if (i.category !== "top") return true;
              const isLayer =
                i.is_layering_piece === true ||
                i.subcategory === "cardigan" ||
                i.subcategory === "hoodie";
              return !isLayer;
            });
            if (stripped.length !== beforeLen) {
              fixes.push(`stripped over-layer top (warm temp ${weather.temp}°C + indoor)`);
            }
          }
        }
      }
      // R18a BELT STRIP — when the AI added a belt that doesn't fit
      // the base (slip / bodycon / sheath / shift dresses, slim-fit
      // dresses, elastic-waist or already-belted bottoms, etc.), strip
      // the belt rather than ship a wrong-belt outfit. Same approach
      // as the outerwear strip below — preserves the outfit minus the
      // offending accessory.
      {
        const NO_BELT_DRESS_SILHOUETTES = new Set<string>([
          "slip",
          "bodycon",
          "mermaid",
          "sheath",
          "shift",
        ]);
        const NO_BELT_BOTTOM_CLOSURES = new Set<string>([
          "elastic",
          "drawstring",
          "pull-on",
          "side-zip",
        ]);
        const NO_BELT_BOTTOM_SUBS = new Set<string>([
          "leggings",
          "sweatpants",
        ]);
        const beltBlocked = stripped.some((i) => {
          if (i.category === "dress" || i.category === "one-piece") {
            if (i.dress_silhouette && NO_BELT_DRESS_SILHOUETTES.has(i.dress_silhouette)) return true;
            if (i.fit === "slim") return true;
            if (i.waist_style === "belted" || i.waist_style === "elastic") return true;
            // Overalls have built-in waist + suspenders defining the
            // silhouette; a belt clashes with the overall straps.
            if (i.category === "one-piece" && i.subcategory === "overalls") return true;
          }
          if (i.category === "bottom") {
            if (i.subcategory && NO_BELT_BOTTOM_SUBS.has(i.subcategory)) return true;
            if (i.waist_closure && NO_BELT_BOTTOM_CLOSURES.has(i.waist_closure)) return true;
            if (i.waist_style === "belted" || i.waist_style === "elastic") return true;
            if (i.fit === "slim") return true;
          }
          return false;
        });
        if (beltBlocked) {
          const beforeLen = stripped.length;
          stripped = stripped.filter(
            (i) => !(i.category === "accessory" && i.subcategory === "belt")
          );
          if (stripped.length !== beforeLen) {
            fixes.push("stripped belt (incompatible base — slip/bodycon/slim/elastic-waist/overalls)");
          }
        }
      }

      // R4b LAYERING STRIP — when the AI picked an oversized base top
      // AND a structured outerwear (denim/leather/bomber/blazer/etc),
      // strip the outerwear so auto-injection (next block) can try to
      // substitute a long coat. Without this, the outfit would be
      // hard-dropped later — too aggressive given many wardrobes lack
      // long coats. Stripping preserves the outfit; if no long coat
      // exists, the cardigan stays as the outermost layer.
      {
        // Match the post-parse drop's condition exactly — both check
        // category=top + fit=oversized regardless of is_layering_piece,
        // so the strip prevents the drop from ever firing.
        const oversizedBase = stripped.find(
          (i) => i.category === "top" && i.fit === "oversized"
        );
        const outer = stripped.find((i) => i.category === "outerwear");
        if (oversizedBase && outer) {
          const LONG_COAT_SUBS = new Set<string>([
            "coat",
            "peacoat",
            "trench-coat",
            "parka",
          ]);
          const isLongCoat = LONG_COAT_SUBS.has(outer.subcategory ?? "");
          const isOkPuffer =
            outer.subcategory === "puffer" &&
            (outer.fit === "oversized" || outer.fit === "loose");
          if (!isLongCoat && !isOkPuffer) {
            stripped = stripped.filter((i) => i.id !== outer.id);
            fixes.push(
              `stripped ${outer.subcategory ?? "outerwear"} (incompatible with oversized ${oversizedBase.subcategory ?? "top"})`
            );
          }
        }
      }

      // Auto-inject an outerwear piece when the outfit is cold but missing
      // one. Pick closest-warmth-match; bias the fit so we don't layer a
      // slim jacket over an oversized sweater (the proportion is off and
      // physically the sweater bunches under the jacket).
      //
      // CARDIGAN SUBSTITUTE: in mild cold (10-17°C) on indoor-leaning
      // occasions, a chunky cardigan (warmth ≥3, not a layering piece)
      // is enough — skip auto-injection and let the cardigan be the
      // outermost layer.
      const INDOOR_LEANING = new Set<string>([
        "at-home",
        "work",
        "dinner-out",
        "date",
        "party",
        "formal",
        "brunch",
      ]);
      const cardiganSubstitute = stripped.find(
        (i) =>
          i.category === "top" &&
          i.subcategory === "cardigan" &&
          (i.warmth_rating ?? 0) >= 3 &&
          !i.is_layering_piece
      );
      const cardiganQualifies =
        cardiganSubstitute &&
        weather &&
        typeof weather.temp === "number" &&
        weather.temp >= 10 &&
        weather.temp < 18 &&
        INDOOR_LEANING.has(occasion);
      if (
        // At-home is INDOORS — never auto-inject outerwear regardless
        // of temperature. Mirrors the at-home pre-filter and post-parse
        // strip; without this guard the auto-inject re-adds the
        // outerwear we just stripped.
        occasion !== "at-home" &&
        weather &&
        typeof weather.temp === "number" &&
        weather.temp < 12 &&
        !stripped.some((i) => i.category === "outerwear") &&
        !cardiganQualifies
      ) {
        // Pool: pre-filtered fullPool first — it respects the formality /
        // warmth pre-filters AND the recent-anchor freshness ban
        // (outerwear is an anchor category, so the raw wardrobe could
        // re-inject the exact coat just excluded for freshness). Raw
        // wardrobe only as graceful fallback. Either way never inject a
        // rain-blocked material when rain is forecast — the rain
        // validator would hard-drop the outfit this injection "fixed".
        const fromPool = fullPool.filter((i) => i.category === "outerwear");
        const fromWardrobe = items.filter(
          (i) => i.category === "outerwear" && !i.is_stored
        );
        let available = fromPool.length > 0 ? fromPool : fromWardrobe;
        if (rainTriggered) {
          available = available.filter((i) => !rainBlocked(i));
        }
        if (available.length > 0) {
          const targetWarmth =
            weather.temp < 5 ? 4.5 : weather.temp < 10 ? 3.5 : 2.5;
          // If the base top is oversized, only long drapey coats or
          // oversized/loose puffers can layer cleanly. Structured
          // shoulder pieces (denim, leather, bomber, blazer) bunch
          // over the bulk regardless of their own Fit class.
          // For "loose" base tops, just avoid slim outerwear.
          const baseTopFit = stripped.find(
            (i) => i.category === "top" && !i.is_layering_piece
          )?.fit;
          const baseIsOversized = baseTopFit === "oversized";
          const baseIsLoose = baseTopFit === "loose";
          const LONG_COAT_SUBS = new Set<string>([
            "coat",
            "peacoat",
            "trench-coat",
            "parka",
          ]);
          const fitCompatible = (o: ClothingItem) => {
            if (baseIsOversized) {
              if (LONG_COAT_SUBS.has(o.subcategory ?? "")) return true;
              if (
                o.subcategory === "puffer" &&
                (o.fit === "oversized" || o.fit === "loose")
              ) {
                return true;
              }
              return false;
            }
            if (baseIsLoose) return o.fit !== "slim";
            return true;
          };
          const preferred = available.filter(fitCompatible);
          const pool = preferred.length > 0 ? preferred : available;
          let best = pool[0];
          let bestDist = Math.abs((best.warmth_rating ?? 3) - targetWarmth);
          for (const o of pool.slice(1)) {
            const d = Math.abs((o.warmth_rating ?? 3) - targetWarmth);
            if (d < bestDist) {
              best = o;
              bestDist = d;
            }
          }
          const alreadySub = stripped.some(
            (i) => i.subcategory && i.subcategory === best.subcategory
          );
          if (!alreadySub) {
            stripped = [...stripped, best];
            fixes.push(`injected outerwear: ${best.subcategory ?? "jacket"}`);
          }
        }
      }

      // Auto-inject shoes when the outfit is non-at-home but missing them
      // and the wardrobe has shoes available. The AI skips shoes about as
      // often as it skips jackets. Inject from the PRE-FILTERED pool
      // (promptItems) so the injection naturally respects occasion
      // bans (no sneakers at work, no open-toe in rain, etc.). If the
      // pre-filtered pool has no shoes, fall back to any wardrobe shoe
      // — graceful degrade rather than empty.
      if (
        occasion !== "at-home" &&
        !stripped.some((i) => i.category === "shoes")
      ) {
        const filteredShoes = promptItems.filter(
          (i) => i.category === "shoes"
        );
        const availableShoes = items.filter(
          (i) => i.category === "shoes" && !i.is_stored
        );
        let pool = filteredShoes.length > 0 ? filteredShoes : availableShoes;
        if (rainTriggered) {
          const dry = pool.filter((i) => !rainBlocked(i));
          if (dry.length > 0) pool = dry;
        }
        const best = pickInjectionCandidate(pool, stripped, true);
        if (best) {
          stripped = [...stripped, best];
          fixes.push(`injected shoes: ${best.subcategory ?? "shoes"}`);
        }
      }

      // Auto-inject a bag for every occasion except at-home and outdoor
      // (matches Rule 11). Same pre-filter-first pattern as shoes —
      // pull from promptItems so an auto-injected bag at a formal /
      // date occasion isn't a casual canvas tote that the main filter
      // would later drop.
      if (
        occasion !== "at-home" &&
        occasion !== "outdoor" &&
        !stripped.some((i) => i.category === "bag")
      ) {
        const filteredBags = promptItems.filter(
          (i) => i.category === "bag"
        );
        const availableBags = items.filter(
          (i) => i.category === "bag" && !i.is_stored
        );
        let pool = filteredBags.length > 0 ? filteredBags : availableBags;
        if (rainTriggered) {
          const dry = pool.filter((i) => !rainBlocked(i));
          if (dry.length > 0) pool = dry;
        }
        const best = pickInjectionCandidate(pool, stripped, false);
        if (best) {
          stripped = [...stripped, best];
          fixes.push(`injected bag: ${best.subcategory ?? "bag"}`);
        }
      }

      // Auto-inject one accessory beyond the bag for every occasion
      // except at-home and outdoor (matches the ACCESSORY MINIMUM rule).
      // Skip hat at work (Rule 11 hat × occasion). Prefer accessories
      // tagged for the occasion, falling back to any eligible accessory
      // (most users don't tag accessories, so a tag-only rule would
      // almost never fire). Preset/metal conflicts skip the injection
      // entirely — see pickInjectionCandidate.
      if (
        occasion !== "at-home" &&
        occasion !== "outdoor" &&
        !stripped.some((i) => i.category === "accessory")
      ) {
        // Pre-filter-first injection — same pattern as shoes / bag.
        // Pulls from promptItems so the injection respects occasion
        // bans (e.g. baseball cap at work, casual hat silhouette at
        // formal). Falls back to the full wardrobe when the
        // pre-filtered pool is empty.
        //
        // CRITICAL: exclude belts from the pool when the base outfit
        // already blocks belts (belted dress, slim-fit base, elastic
        // waist, etc.). The BELT STRIP a few blocks above just removed
        // a belt for exactly this reason; without this guard the
        // accessory minimum re-injects the same belt right back —
        // shipping the wrong-belt outfit the strip was meant to
        // prevent. The check mirrors the R18a beltBlocked predicate.
        const NO_BELT_DRESS_SILHOUETTES = new Set<string>([
          "slip",
          "bodycon",
          "mermaid",
          "sheath",
          "shift",
        ]);
        const NO_BELT_BOTTOM_CLOSURES = new Set<string>([
          "elastic",
          "drawstring",
          "pull-on",
          "side-zip",
        ]);
        const NO_BELT_BOTTOM_SUBS = new Set<string>([
          "leggings",
          "sweatpants",
        ]);
        const baseBlocksBelt = stripped.some((i) => {
          if (i.category === "dress" || i.category === "one-piece") {
            if (i.dress_silhouette && NO_BELT_DRESS_SILHOUETTES.has(i.dress_silhouette)) return true;
            if (i.fit === "slim") return true;
            if (i.waist_style === "belted" || i.waist_style === "elastic") return true;
            if (i.category === "one-piece" && i.subcategory === "overalls") return true;
          }
          if (i.category === "bottom") {
            if (i.subcategory && NO_BELT_BOTTOM_SUBS.has(i.subcategory)) return true;
            if (i.waist_closure && NO_BELT_BOTTOM_CLOSURES.has(i.waist_closure)) return true;
            if (i.waist_style === "belted" || i.waist_style === "elastic") return true;
            if (i.fit === "slim") return true;
          }
          return false;
        });
        const filteredAccessories = promptItems.filter((i) => {
          if (i.category !== "accessory") return false;
          if (occasion === "work" && i.subcategory === "hat") return false;
          if (baseBlocksBelt && i.subcategory === "belt") return false;
          return true;
        });
        const availableAccessories = items.filter((i) => {
          if (i.category !== "accessory" || i.is_stored) return false;
          if (occasion === "work" && i.subcategory === "hat") return false;
          if (baseBlocksBelt && i.subcategory === "belt") return false;
          return true;
        });
        let pool =
          filteredAccessories.length > 0
            ? filteredAccessories
            : availableAccessories;
        // If the base is a belt-friendly dress (a-line / wrap /
        // fit-and-flare with a free waist), the R18 completer downstream
        // HARD-requires a belt — prefer injecting one here so the server
        // doesn't inject a scarf and then drop its own outfit for
        // missing the belt. Mirrors the completer's predicate and its
        // mood exemptions (at-home/outdoor never reach this injector).
        const BELT_FRIENDLY_SILS = new Set(["a-line", "wrap", "fit-and-flare"]);
        const beltExemptMood =
          mood === "chill" || mood === "cozy" || mood === "period";
        const beltDesired =
          !beltExemptMood &&
          !baseBlocksBelt &&
          stripped.some(
            (i) =>
              (i.category === "dress" || i.category === "one-piece") &&
              i.dress_silhouette != null &&
              BELT_FRIENDLY_SILS.has(i.dress_silhouette) &&
              i.fit !== "slim" &&
              i.waist_style !== "belted"
          );
        if (beltDesired) {
          const belts = pool.filter((i) => i.subcategory === "belt");
          if (belts.length > 0) pool = belts;
        }
        const best = pickInjectionCandidate(pool, stripped, false);
        if (best) {
          stripped = [...stripped, best];
          fixes.push(`injected accessory: ${best.subcategory ?? "accessory"}`);
        }
      }

// Apply the canonical display order so every consumer of this
      // suggestion sees items head-to-toe (top, bottom, outerwear,
      // shoes, bag, accessories).
      const outfitItems = orderOutfitItems(stripped);

      // Hybrid text: prefer the AI's one-sentence prose; fall back to the
      // server template ONLY when the AI slips a hallucinated category
      // word into the text (the "moto jacket" bug). Keeps creative voice
      // where it's safe, guarantees consistency where it isn't.
      const aiReasoning = oneSentence(s.reasoning);
      const aiTip = oneSentence(s.styling_tip);
      const guardLocale = locale === "fr" ? "fr" : "en";
      const reasoning =
        aiReasoning && textIsConsistent(outfitItems, aiReasoning, guardLocale)
          ? aiReasoning
          : buildReasoning(outfitItems, mood, occasion, weather, locale);
      let styling_tip: string | null =
        aiTip && textIsConsistent(outfitItems, aiTip, guardLocale)
          ? aiTip
          : buildStylingTip(outfitItems, locale);

      // Tights nudge: when it's cold and the outfit has an exposed-leg
      // piece (mini/midi dress, skirt, shorts), append a reminder to
      // layer opaque tights. Skips if the dress is a maxi (legs already
      // covered) or the outfit is at-home.
      if (
        weather &&
        typeof weather.temp === "number" &&
        weather.temp < 12 &&
        occasion !== "at-home"
      ) {
        const hasExposedLegPiece = outfitItems.some((i) => {
          if (i.category === "dress") return i.subcategory !== "maxi-dress";
          if (i.category === "bottom") {
            return i.subcategory === "skirt" || i.subcategory === "shorts";
          }
          return false;
        });
        if (hasExposedLegPiece) {
          const tightsTip =
            locale === "fr"
              ? "Ajoute des collants opaques pour tenir le froid."
              : "Layer opaque tights underneath for warmth.";
          styling_tip = styling_tip ? `${styling_tip} ${tightsTip}` : tightsTip;
        }
      }

      const nameFallback = `${moodInfo.label} look`;
      const name = cleanName(s.name, nameFallback, outfitItems);

      return {
        items: outfitItems,
        score: 1,
        reasoning,
        styling_tip,
        color_harmony: "ai-styled",
        mood_match: mood,
        name,
        weather_temp: weather?.temp ?? null,
        weather_condition: weather?.condition ?? null,
        relaxed: false,
        _fixes: fixes,
        _ids: outfitItems.map((i) => i.id),
      };
    };
    let mapped = parsedOutfits.map(buildOutfit);

    // Wardrobe-availability flag used by the post-parse filters. If the
    // user's wardrobe has no shoes we can't demand them — best-effort is
    // better than no suggestions. (Outerwear has no equivalent flag: the
    // injector checks pool availability itself.)
    const wardrobeHasShoes = items.some((i) => i.category === "shoes");
    // Capability flags used by the post-parse filter to decide whether
    // a "missing dressy material" or "missing belt" should be a hard
    // drop or silently waived (we don't drop something the user can't
    // physically satisfy).
    const DRESSY_MATERIALS = new Set<string>([
      "silk",
      "satin",
      "chiffon",
      "lace",
      "velvet",
      "patent-leather",
    ]);
    const wardrobeHasDressyMaterial = items.some((i) => {
      const mats = Array.isArray(i.material) ? i.material : [i.material];
      return mats.some((m) => m && DRESSY_MATERIALS.has(m as string));
    });
    const wardrobeHasBelt = items.some(
      (i) => i.category === "accessory" && i.subcategory === "belt"
    );
    // True if the user owns at least one bag that would PASS the formal /
    // date / party bag rules (no backpack, no canvas/nylon material, no
    // woven/fringed texture). When false, those rules silently skip — a
    // user with only casual bags shouldn't get zero outfits at every
    // dressy occasion. Same wardrobe-gap pattern as wardrobeHasDressyMaterial.
    const wardrobeHasFormalBag = items.some((i) => {
      if (i.is_stored || i.category !== "bag") return false;
      if (i.subcategory === "backpack") return false;
      const mats = Array.isArray(i.material) ? i.material : [i.material];
      const casualMat = mats.some((m) => m === "canvas" || m === "nylon");
      const casualTex = i.bag_texture === "woven" || i.bag_texture === "fringed";
      return !casualMat && !casualTex;
    });

    // Compute the "base layer" warmth — the warmth of what sits directly
    // against the skin. For cold weather this matters more than the
    // outerwear's warmth: a warmth-1 mini floral dress under a warmth-5
    // coat is still wrong, because the dress itself can't handle the
    // temperature when the coat comes off indoors.
    const baseWarmth = (outfit: ClothingItem[]): number => {
      const dress = outfit.find((i) => i.category === "dress");
      if (dress) return dress.warmth_rating ?? 3;
      const jumpsuit = outfit.find(
        (i) => i.category === "one-piece" && i.subcategory !== "overalls"
      );
      if (jumpsuit) return jumpsuit.warmth_rating ?? 3;
      const warmths: number[] = [];
      const overalls = outfit.find(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (overalls) warmths.push(overalls.warmth_rating ?? 3);
      const top = outfit.find((i) => i.category === "top");
      const bottom = outfit.find((i) => i.category === "bottom");
      if (top) warmths.push(top.warmth_rating ?? 3);
      if (bottom) warmths.push(bottom.warmth_rating ?? 3);
      return warmths.length > 0 ? Math.min(...warmths) : 3;
    };

    // Rigid drops (truly broken outfits) vs soft drops (quality issues —
    // base-layer warmth mismatch). When hard drops empty the pool we
    // admit soft-dropped outfits back with a styling tip explaining the
    // gap. Cold-without-outerwear is handled upstream via auto-injection.
    //
    // SOFT DROPS ARE DEFERRED: a soft violation no longer short-circuits
    // the filter. The outfit keeps running through every remaining HARD
    // rule, and only lands in softMismatch if it is hard-clean. This
    // closes the audit's admitSoft hole where a denim-on-denim outfit
    // (soft) skipped the mood/base/cardigan/belt hard rules entirely and
    // was resurrected violating them.
    type DropEntry = { ids: string[]; reason: string };
    type SoftEntry = { outfit: typeof mapped[number]; tip?: string };

    // The whole validation pass is a function so the regenerate-with-
    // feedback path can score a second model attempt with identical
    // semantics and fresh drop arrays.
    // (Preset detection + isDarkItem + rain trigger + metal families are
    // hoisted above the map phase so the injectors share them.)

    // Mood-specific color/pattern detectors used by the validators and
    // the fallback gate. Saturated brights cover the warm + cool sides
    // of the bright spectrum (no neutrals, no muted earth tones). A
    // "statement piece" qualifies on saturated color OR non-solid
    // pattern OR an oversized fit (shape statement).
    const SATURATED_BRIGHT_RE =
      /\b(?:red|orange|yellow|fuchsia|magenta|pink|cobalt|royal|kelly|emerald|crimson|scarlet|tangerine|chartreuse|cyan|turquoise|coral|lime|electric|hot[- ]pink|cherry|mustard)\b/i;
    const itemHasBright = (it: ClothingItem) =>
      (it.colors ?? []).some((c) => SATURATED_BRIGHT_RE.test(c.name));
    const itemHasStatement = (it: ClothingItem) => {
      if (itemHasBright(it)) return true;
      const ps = Array.isArray(it.pattern) ? it.pattern : [it.pattern];
      if (ps.some((p) => p && p !== "solid")) return true;
      if (it.fit === "oversized") return true;
      return false;
    };
    const itemIsStructured = (it: ClothingItem) =>
      it.subcategory === "blazer" ||
      it.dress_silhouette === "sheath" ||
      (it.category === "bottom" && it.subcategory === "trousers");
    // Comfort Day's "NEVER tailored" ban needs a NARROWER predicate than
    // itemIsStructured: that one counts every `trousers` subcategory as
    // structured, which is fine for Confident's require-side (false
    // positives are harmless) but wrong for a ban — elastic-waist
    // wide-leg pull-on trousers are exactly comfort-day wear, and the
    // blunt version was hard-dropping them ("Elastic band extra wide
    // thin jeans" → rejected → honest-empty, found in beta testing).
    const itemIsTailoredForComfortBan = (it: ClothingItem) => {
      if (it.subcategory === "blazer") return true;
      if (it.dress_silhouette === "sheath") return true;
      if (it.category === "bottom" && it.subcategory === "trousers") {
        const softWaist =
          it.waist_style === "elastic" ||
          it.waist_closure === "elastic" ||
          it.waist_closure === "drawstring" ||
          it.waist_closure === "pull-on";
        const relaxedFit =
          it.fit === "loose" ||
          it.fit === "oversized" ||
          it.bottom_fit === "wide-leg";
        return !softWaist && !relaxedFit;
      }
      return false;
    };

    // Wardrobe-aware capabilities: each mood validator only fires
    // when the wardrobe actually contains a compliant item, so a user
    // with no bright pieces doesn't get an empty Energized result.
    const activeWardrobe = items.filter((i) => !i.is_stored);
    const wardrobeHasStructured = activeWardrobe.some(itemIsStructured);
    const wardrobeHasBright = activeWardrobe.some(itemHasBright);
    const wardrobeHasStatement = activeWardrobe.some(itemHasStatement);

    const runValidation = (candidates: typeof mapped) => {
      const drops: DropEntry[] = [];
      const softMismatch: SoftEntry[] = [];

      const valid = candidates.filter((s) => {
      // First soft violation gets parked here; applied at the end only
      // if every hard rule passed.
      let pendingSoft: { tip?: string } | null = null;
      // Shoes required for every occasion except at-home (if wardrobe has shoes).
      if (occasion !== "at-home" && wardrobeHasShoes) {
        const hasShoes = s.items.some((i) => i.category === "shoes");
        if (!hasShoes) {
          drops.push({ ids: s._ids, reason: "missing shoes" });
          return false;
        }
      }
      // Preset enforcement — Claude says it follows these but the AI is
      // unreliable. Drop any outfit that breaks a hard preset rule.
      if (wantsAllBlack) {
        const offender = s.items.find((i) => !isDarkItem(i));
        if (offender) {
          drops.push({
            ids: s._ids,
            reason: `all-black: "${offender.name}" primary color "${offender.colors?.[0]?.name}" not dark`,
          });
          return false;
        }
      }
      if (wantsDressDay) {
        const hasDress = s.items.some((i) => i.category === "dress");
        if (!hasDress) {
          drops.push({ ids: s._ids, reason: "dress-day preset but no dress" });
          return false;
        }
      }
      if (wantsMixPatterns) {
        const nonSolidCount = s.items.filter((i) => {
          const patterns = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
          return patterns.some((p) => p && p !== "solid");
        }).length;
        if (nonSolidCount < 2) {
          drops.push({
            ids: s._ids,
            reason: `mix-patterns: only ${nonSolidCount} non-solid item(s)`,
          });
          return false;
        }
      }
      // Hat formality block — no hats at work or formal events.
      if (occasion === "work" || occasion === "formal") {
        const hat = s.items.find(
          (i) => i.category === "accessory" && i.subcategory === "hat"
        );
        if (hat) {
          drops.push({ ids: s._ids, reason: `hat not allowed at ${occasion}` });
          return false;
        }
      }
      // Hat silhouette × occasion — for formal/date/dinner-out, block
      // baseball/trucker/bucket caps. For velvet/felt at formal/party,
      // restrict to beret/pillbox/headband only.
      if (occasion === "formal" || occasion === "date" || occasion === "dinner-out") {
        const casualHat = s.items.find(
          (i) =>
            i.category === "accessory" &&
            i.subcategory === "hat" &&
            (i.hat_silhouette === "baseball" ||
              i.hat_silhouette === "trucker" ||
              i.hat_silhouette === "bucket")
        );
        if (casualHat) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: hat silhouette "${casualHat.hat_silhouette}" too casual`,
          });
          return false;
        }
      }
      if (occasion === "formal" || occasion === "party") {
        const dressyTextureWrongShape = s.items.find((i) => {
          if (i.category !== "accessory" || i.subcategory !== "hat") return false;
          if (i.hat_texture !== "velvet" && i.hat_texture !== "felt") return false;
          if (i.hat_silhouette === "beret" || i.hat_silhouette === "pillbox" || i.hat_silhouette === "headband") return false;
          // Velvet/felt with no silhouette set is acceptable; only block when both are known and silhouette is wrong.
          if (!i.hat_silhouette) return false;
          return true;
        });
        if (dressyTextureWrongShape) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: ${dressyTextureWrongShape.hat_texture} hat must be beret/pillbox/headband`,
          });
          return false;
        }
      }
      // Office open-toe / sandals guardrail — both tracks. (Was men-only;
      // the prompt's office template bans open footwear for Track A too
      // but nothing enforced it.) User-tagged "work" overrides, same as
      // the jeans/sneakers opt-outs below.
      if (occasion === "work") {
        const openToe = s.items.find(
          (i) =>
            i.category === "shoes" &&
            (i.toe_shape === "open-toe" || i.toe_shape === "peep-toe" || i.subcategory === "sandals")
        );
        if (openToe && !(openToe.occasions ?? []).includes("work")) {
          drops.push({ ids: s._ids, reason: `work: open-toe / sandals ("${openToe.name}") not office-appropriate` });
          return false;
        }
      }
      // Skirt length × occasion (Track A only): no mini at work.
      if (gender !== "man" && occasion === "work") {
        const miniSkirt = s.items.find(
          (i) =>
            i.category === "bottom" &&
            i.subcategory === "skirt" &&
            i.skirt_length === "mini"
        );
        if (miniSkirt) {
          drops.push({
            ids: s._ids,
            reason: "work: mini skirt not professional",
          });
          return false;
        }
        // R9 — no denim bottoms at the office (Track A only). Men's
        // office prompt explicitly allows jeans, so this drop is gated
        // on Track A. UNLESS the user explicitly tagged the jeans for
        // "work" (their workplace allows it).
        const jeans = s.items.find(
          (i) => i.category === "bottom" && i.subcategory === "jeans"
        );
        if (jeans && !(jeans.occasions ?? []).includes("work")) {
          drops.push({
            ids: s._ids,
            reason: `work: denim "${jeans.name}" not office-appropriate`,
          });
          return false;
        }
      }
      // R9 — no athletic sneakers at the office (universal, both tracks).
      // Athletic sneakers don't belong at any office regardless of
      // gender. The men's prompt allows clean leather sneakers as
      // "smart casual," but those are subcategory "loafers" or have
      // toe_shape="round" + non-athletic upper — distinct from
      // subcategory="sneakers" which is the athletic class. UNLESS the
      // user explicitly tagged these sneakers for "work".
      if (occasion === "work") {
        const athleticSneakers = s.items.find(
          (i) => i.category === "shoes" && i.subcategory === "sneakers"
        );
        if (athleticSneakers && !(athleticSneakers.occasions ?? []).includes("work")) {
          drops.push({
            ids: s._ids,
            reason: `work: athletic sneakers "${athleticSneakers.name}" not office-appropriate`,
          });
          return false;
        }
      }
      // CASUAL-WEAR × DRESSY OCCASIONS — universal blocks (both tracks).
      // Shorts / sweatpants / leggings / hoodies don't belong at dressed-
      // up occasions. Skorts read sporty-casual at work but work
      // elsewhere.
      {
        const DRESSY_OCC_NO_SHORTS = new Set<string>([
          "work",
          "formal",
          "dinner-out",
          "date",
          "party",
        ]);
        const DRESSY_OCC_NO_LOUNGE = new Set<string>([
          "work",
          "formal",
          "dinner-out",
          "date",
          "party",
          "brunch",
        ]);
        const DRESSY_OCC_NO_HOODIE = new Set<string>([
          "work",
          "formal",
          "dinner-out",
          "date",
          "party",
        ]);
        if (DRESSY_OCC_NO_SHORTS.has(occasion)) {
          const shorts = s.items.find(
            (i) => i.category === "bottom" && i.subcategory === "shorts"
          );
          if (shorts) {
            drops.push({
              ids: s._ids,
              reason: `${occasion}: shorts not appropriate`,
            });
            return false;
          }
        }
        if (DRESSY_OCC_NO_LOUNGE.has(occasion)) {
          const lounge = s.items.find(
            (i) =>
              i.category === "bottom" &&
              (i.subcategory === "sweatpants" || i.subcategory === "leggings")
          );
          if (lounge) {
            drops.push({
              ids: s._ids,
              reason: `${occasion}: ${lounge.subcategory} too casual`,
            });
            return false;
          }
        }
        if (DRESSY_OCC_NO_HOODIE.has(occasion)) {
          const hoodie = s.items.find(
            (i) => i.category === "top" && i.subcategory === "hoodie"
          );
          if (hoodie) {
            drops.push({
              ids: s._ids,
              reason: `${occasion}: hoodie too casual`,
            });
            return false;
          }
        }
        // Skort × work — sporty-casual, not office-appropriate (both tracks).
        if (occasion === "work") {
          const skort = s.items.find(
            (i) => i.category === "bottom" && i.subcategory === "skort"
          );
          if (skort) {
            drops.push({
              ids: s._ids,
              reason: "work: skort too sporty-casual for office",
            });
            return false;
          }
        }
        // Tank top × work — R9 bans tanks at the office, with the
        // prompt's own carve-out: a polished cami under a blazer is
        // fine. User-tagged "work" also overrides.
        if (occasion === "work") {
          const tank = s.items.find(
            (i) => i.category === "top" && i.subcategory === "tank-top"
          );
          const hasBlazer = s.items.some(
            (i) => i.subcategory === "blazer"
          );
          if (
            tank &&
            !hasBlazer &&
            !(tank.occasions ?? []).includes("work")
          ) {
            drops.push({
              ids: s._ids,
              reason: `work: tank top "${tank.name}" without a blazer`,
            });
            return false;
          }
        }
      }
      // BACKPACK × dressy occasions — formal / party / date / dinner-out
      // read student/commute with a backpack. Two override gates:
      //   1. User explicitly tagged this backpack for the occasion → respect
      //      their judgment (the user knows their wardrobe better than us).
      //   2. The wardrobe has no formal bag at all → skip the rule, otherwise
      //      we'd zero out every outfit for users without a clutch / handbag.
      if (
        wardrobeHasFormalBag &&
        (occasion === "formal" ||
          occasion === "party" ||
          occasion === "date" ||
          occasion === "dinner-out")
      ) {
        const backpack = s.items.find(
          (i) => i.category === "bag" && i.subcategory === "backpack"
        );
        if (backpack && !(backpack.occasions ?? []).includes(occasion)) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: backpack reads too casual`,
          });
          return false;
        }
      }
      // R9 — work dress silhouette: prompt says avoid bodycon/slip/mermaid
      // for the office. Enforce as a hard drop since the AI sometimes
      // picks a slip dress for "confident · work" against the rule.
      if (occasion === "work") {
        const wrongWorkDress = s.items.find(
          (i) =>
            i.category === "dress" &&
            (i.dress_silhouette === "slip" ||
              i.dress_silhouette === "bodycon" ||
              i.dress_silhouette === "mermaid")
        );
        if (wrongWorkDress) {
          drops.push({
            ids: s._ids,
            reason: `work: dress silhouette "${wrongWorkDress.dress_silhouette}" not office-appropriate`,
          });
          return false;
        }
      }
      // (Soft drops — R8 evening dressy material AND R18 belt completer —
      // live at the END of this filter. They short-circuit with `return
      // false` and push to softMismatch, where admitSoft re-introduces
      // them when the hard pool is empty. If a soft drop fires BEFORE
      // hard checks, the outfit can sneak back in via admit-back without
      // ever being validated against the hard rules below it (e.g.
      // bag formality, metal sync, rain, denim-on-denim, pattern echo).
      // Keeping all soft drops at the bottom of the filter guarantees
      // they only fire on outfits that already passed every hard rule.)
      // (Jewelry/watch were removed from the schema — the legacy
      // hat+statement-jewelry proximity drop and metal sync rules for
      // those subcategories are gone.)
      // Bag formality — for formal/date/party, drop bags with casual
      // material (canvas/nylon) or casual texture (woven/fringed). Same
      // override pattern as the backpack rule above:
      //   1. If the user explicitly tagged this bag for the current
      //      occasion, skip the material/texture check entirely. They
      //      know their wardrobe better than a generic material rule
      //      (e.g. a Bottega-style woven leather bag is undeniably
      //      formal but would fail "woven texture" otherwise).
      //   2. If the wardrobe has no formal bag at all, skip too.
      if (
        wardrobeHasFormalBag &&
        (occasion === "formal" || occasion === "date" || occasion === "party")
      ) {
        const bag = s.items.find((i) => i.category === "bag");
        if (bag && !(bag.occasions ?? []).includes(occasion)) {
          const mats = Array.isArray(bag.material) ? bag.material : [bag.material];
          const casualMat = mats.some((m) => m === "canvas" || m === "nylon");
          const casualTex =
            bag.bag_texture === "woven" || bag.bag_texture === "fringed";
          if (casualMat || casualTex) {
            drops.push({
              ids: s._ids,
              reason: `bag too casual for ${occasion} (material=${mats.join(",")}, texture=${bag.bag_texture})`,
            });
            return false;
          }
          // Bag size — formal/party/date should be clutch or small. AI
          // names this in the prompt but doesn't always honor it, so
          // enforce post-parse.
          if (bag.bag_size && !["clutch", "small"].includes(bag.bag_size)) {
            drops.push({
              ids: s._ids,
              reason: `${occasion}: bag size "${bag.bag_size}" should be clutch/small`,
            });
            return false;
          }
        }
      }
      // Work bag size — clutch is too small for the office.
      if (occasion === "work") {
        const bag = s.items.find((i) => i.category === "bag");
        if (bag && bag.bag_size === "clutch") {
          drops.push({
            ids: s._ids,
            reason: "work: clutch too small for the office (need medium/large)",
          });
          return false;
        }
      }
      // Metal sync — all visible hardware must match. Skipped when mood
      // is Playful (the only mood that explicitly allows mixed metals).
      // On the men's track, the bag is excluded from the sync (men's
      // looks bias toward watch / belt / shoes for metal hardware).
      if (mood !== "playful") {
        const metalItems = s.items
          .map((i) => {
            // Bags use bag_metal_finish; everyone else uses metal_finish.
            const finish = i.category === "bag" ? i.bag_metal_finish : i.metal_finish;
            return { item: i, finish };
          })
          .filter(({ item, finish }) => {
            if (!finish || finish === "none" || finish === "mixed") return false;
            // Only count items where hardware is visible / styling-relevant.
            if (item.category === "shoes") return true;
            if (item.category === "bag" && gender !== "man") return true;
            if (item.category === "accessory" && item.subcategory === "belt") return true;
            return false;
          });
        if (metalItems.length >= 2) {
          const families = new Set(
            metalItems.map(({ finish }) =>
              GOLD_FAMILY.has(finish ?? "") ? "gold" : SILVER_FAMILY.has(finish ?? "") ? "silver" : "other"
            )
          );
          if (families.size > 1) {
            drops.push({
              ids: s._ids,
              reason: `metal mismatch: ${metalItems.map(({ item, finish }) => `${item.subcategory ?? item.category}=${finish}`).join(", ")}`,
            });
            return false;
          }
        }
      }
      // Proximity — head/neck zone. If the outfit has a hat AND a
      // decorative scarf, drop. A functional scarf (warmth layer) is
      // allowed regardless of temp (Slot 3 doesn't compete for the
      // focal slot). Falls back to temp heuristic if scarf_function
      // isn't set: <5°C the scarf is treated as functional.
      {
        const hasHat = s.items.some((i) => i.category === "accessory" && i.subcategory === "hat");
        const scarf = s.items.find((i) => i.category === "accessory" && i.subcategory === "scarf");
        const cold = typeof weather?.temp === "number" && weather.temp < 5;
        const scarfIsFunctional =
          scarf &&
          (scarf.scarf_function === "functional" ||
            (scarf.scarf_function == null && cold));
        if (hasHat && scarf && !scarfIsFunctional) {
          drops.push({
            ids: s._ids,
            reason: `proximity: hat + decorative scarf compete (function=${scarf.scarf_function ?? "unset"}, temp=${weather?.temp ?? "?"}°C)`,
          });
          return false;
        }
      }
      // RAIN material-intelligence — applies to element-facing layers
      // (outerwear, shoes, bag). Base outfit is exempt (handled by the
      // indoor-protection check below). When rain is triggered, drop
      // outfits whose outer-facing items use non-rain-proof materials.
      // (rainTriggered / rainBlocked are hoisted above the map phase.)
      if (rainTriggered) {
        const offenderOuter = s.items.find((i) => {
          if (
            i.category !== "outerwear" &&
            i.category !== "shoes" &&
            i.category !== "bag"
          )
            return false;
          return rainBlocked(i);
        });
        if (offenderOuter) {
          drops.push({
            ids: s._ids,
            reason: `rain-triggered: "${offenderOuter.name}" (${offenderOuter.category}) uses non-rain-proof material`,
          });
          return false;
        }
        // Outdoor / travel + rain → block open-toe / high-heel.
        if (occasion === "outdoor" || occasion === "travel") {
          const badShoe = s.items.find(
            (i) =>
              i.category === "shoes" &&
              (i.toe_shape === "open-toe" ||
                i.toe_shape === "peep-toe" ||
                i.heel_type === "high-heel")
          );
          if (badShoe) {
            drops.push({
              ids: s._ids,
              reason: `rain + ${occasion}: "${badShoe.name}" impractical (toe=${badShoe.toe_shape}, heel=${badShoe.heel_type})`,
            });
            return false;
          }
        }
        // Indoor protection — base layer in non-rain-proof material
        // (silk/satin/suede) at an evening occasion REQUIRES a rain-proof
        // outerwear with length >= "regular" (not cropped).
        const eveningEvent = occasion === "date" || occasion === "dinner-out" || occasion === "party";
        if (eveningEvent) {
          const baseDelicate = s.items.some((i) => {
            if (
              i.category !== "top" &&
              i.category !== "bottom" &&
              i.category !== "dress" &&
              i.category !== "one-piece"
            )
              return false;
            const mats = Array.isArray(i.material) ? i.material : [i.material];
            return mats.some((m) => m === "silk" || m === "satin" || m === "suede");
          });
          if (baseDelicate) {
            const RAIN_PROOF_OUTER = new Set<string>([
              "leather",
              "faux-leather",
              "patent-leather",
              "nylon",
              "polyester",
              "rubber",
            ]);
            const outer = s.items.find((i) => i.category === "outerwear");
            const outerOK =
              outer &&
              (() => {
                const mats = Array.isArray(outer.material) ? outer.material : [outer.material];
                const hasRainProofMat = mats.some((m) => m && RAIN_PROOF_OUTER.has(m));
                const longEnough = outer.length !== "cropped";
                return hasRainProofMat && longEnough;
              })();
            if (!outerOK) {
              drops.push({
                ids: s._ids,
                reason: `rain + evening: delicate base needs rain-proof, non-cropped outerwear`,
              });
              return false;
            }
          }
        }
      }
      // R18e — PATTERN ECHO CAP (anti-matchy-matchy): a statement print
      // should appear ONCE per outfit. Three leopard pieces together
      // reads costume-y, not stylist. Block when 2+ items share the
      // same statement pattern. Striped/plaid get a pass when they're
      // a top+bottom suit pairing (intentional matched-set look).
      {
        const STATEMENT_PATTERNS = new Set<string>([
          "animal-print",
          "floral",
          "polka-dot",
          "graphic",
          "embellished",
          "abstract",
          "camo",
        ]);
        const SUIT_PATTERNS = new Set<string>(["striped", "plaid"]);
        const patternCount = new Map<string, ClothingItem[]>();
        for (const it of s.items) {
          const ps = Array.isArray(it.pattern) ? it.pattern : [it.pattern];
          for (const p of ps) {
            if (!p || p === "solid") continue;
            const list = patternCount.get(p) ?? [];
            list.push(it);
            patternCount.set(p, list);
          }
        }
        let echoOffender: { pattern: string; items: ClothingItem[] } | null =
          null;
        for (const [p, list] of patternCount) {
          if (list.length < 2) continue;
          if (STATEMENT_PATTERNS.has(p)) {
            echoOffender = { pattern: p, items: list };
            break;
          }
          if (SUIT_PATTERNS.has(p)) {
            // Allowed only if exactly 2 items AND they're top + bottom.
            const cats = new Set(list.map((i) => i.category));
            const isSuitPair =
              list.length === 2 && cats.has("top") && cats.has("bottom");
            if (!isSuitPair) {
              echoOffender = { pattern: p, items: list };
              break;
            }
          }
        }
        if (echoOffender) {
          // Soft (deferred) — admitted silently only if hard-clean.
          // No user-facing caveat: telling the user to swap a piece
          // contradicts the AI's own pick and reads as broken. The
          // relaxed flag travels for the validator.
          if (!pendingSoft) pendingSoft = {};
        }
      }
      // R4c — DENIM-ON-DENIM (soft): 2+ items with material containing
      // "denim" reads "Canadian tuxedo." Default avoid; allow only when
      // user opted in via STYLE DIRECTION ("full denim", etc.).
      if (!wantsDenimOnDenim) {
        const denimItems = s.items.filter((i) => {
          const mats = Array.isArray(i.material) ? i.material : [i.material];
          return mats.some((m) => m === "denim");
        });
        if (denimItems.length >= 2) {
          // Soft (deferred) — admit silently only if hard-clean. Same
          // reasoning as the matchy-print case: surfacing the warning
          // contradicts the AI's own pick. Users who want the look opt
          // in via STYLE DIRECTION ("full denim").
          if (!pendingSoft) pendingSoft = {};
        }
      }
      // R4b — LAYERING PROPORTIONS: only a long, drapey coat (or an
      // oversized/loose puffer) can sit cleanly over an oversized top.
      // Structured shoulder pieces — denim jackets, leather jackets,
      // bombers, blazers — bunch over the bulk even when their own
      // Fit is "loose," because the issue is shoulder structure, not
      // body width.
      {
        const oversizedTop = s.items.find(
          (i) => i.category === "top" && i.fit === "oversized"
        );
        const outer = s.items.find((i) => i.category === "outerwear");
        if (oversizedTop && outer) {
          const LONG_COAT_SUBS = new Set<string>([
            "coat",
            "peacoat",
            "trench-coat",
            "parka",
          ]);
          const isLongCoat = LONG_COAT_SUBS.has(outer.subcategory ?? "");
          const isOkPuffer =
            outer.subcategory === "puffer" &&
            (outer.fit === "oversized" || outer.fit === "loose");
          if (!isLongCoat && !isOkPuffer) {
            drops.push({
              ids: s._ids,
              reason: `layering proportions: ${outer.subcategory ?? "outerwear"} (fit=${outer.fit ?? "?"}) can't layer over oversized ${oversizedTop.subcategory ?? "top"} — only long coats / oversized puffers work`,
            });
            return false;
          }
        }
      }
      // SHOE × BOTTOM proportional combos that look bad regardless of
      // occasion or mood. Sourced from stylist consensus across Vogue /
      // Who What Wear / InStyle / The Concept Wardrobe.
      {
        const shoe = s.items.find((i) => i.category === "shoes");
        const bottom = s.items.find((i) => i.category === "bottom");
        if (shoe && bottom) {
          const shoeSub = shoe.subcategory;
          const bottomFit = bottom.bottom_fit;
          const pantsLen = bottom.pants_length;
          let badCombo: string | null = null;

          // TALL-SHAFT BOOTS — fight with wide/flared/bootcut/tapered hems
          // (pant can't fit over the shaft). Midi skirts are fine —
          // boho/Western/riding-boot looks are legitimate. Detected
          // by subcategory=knee-boots OR shoe_height in [knee, over-knee]
          // — the latter catches cowboy/western boots and any other
          // sub that happens to be tall-shaft.
          const shoeHeight = shoe.shoe_height;
          const isTallShaftBoot =
            shoeSub === "knee-boots" ||
            shoeHeight === "knee" ||
            shoeHeight === "over-knee";
          if (isTallShaftBoot) {
            const label = shoeSub ?? "tall boot";
            if (bottomFit === "wide-leg" || bottomFit === "flared" || bottomFit === "bootcut" || bottomFit === "tapered") {
              badCombo = `${label} (tall shaft) × ${bottomFit} pants — shaft conflict`;
            }
          }

          // ANKLE BOOTS — hem-on-shaft + flared/bootcut burying.
          if (!badCombo && shoeSub === "ankle-boots") {
            if (pantsLen === "ankle-crop") {
              badCombo = `ankle-boots × ankle-crop pants — double horizontal at the ankle`;
            } else if (
              (bottomFit === "flared" || bottomFit === "bootcut") &&
              pantsLen === "full"
            ) {
              badCombo = `ankle-boots × full ${bottomFit} pants — flare buries the boot`;
            }
          }

          // SANDALS — drowned by full-length wide hem.
          if (!badCombo && shoeSub === "sandals") {
            if (pantsLen === "full" && bottomFit === "wide-leg") {
              badCombo = `sandals × full wide-leg pants — hem drowns the strap`;
            }
          }

          // FLATS / BALLET FLATS — disappear under flared/bootcut full hems.
          if (!badCombo && (shoeSub === "flats" || shoeSub === "ballet-flats")) {
            if (
              (bottomFit === "flared" || bottomFit === "bootcut") &&
              pantsLen === "full"
            ) {
              badCombo = `${shoeSub} × full ${bottomFit} pants — dragging hem, leg looks stumpy`;
            }
          }

          // ESPADRILLES — casual jute sole vs formal wool trousers.
          if (!badCombo && shoeSub === "espadrilles") {
            const bottomMats = Array.isArray(bottom.material) ? bottom.material : [bottom.material];
            if (
              bottom.subcategory === "trousers" &&
              bottomMats.some((m) => m === "wool" || m === "tweed")
            ) {
              badCombo = `espadrilles × wool/tweed trousers — formality mismatch`;
            }
          }

          if (badCombo) {
            drops.push({ ids: s._ids, reason: `bad combo: ${badCombo}` });
            return false;
          }
        }
      }
      // OUTDOOR SHOE BLOCK — fashion footwear (western boots, knee
      // boots, ballet flats, loafers, mules, espadrilles, heels)
      // doesn't belong on a hike/park/picnic/gym. Only practical shoes pass.
      if (occasion === "outdoor") {
        const OUTDOOR_BAD_SHOES = new Set<string>([
          "western-boots",
          "knee-boots",
          "ballet-flats",
          "loafers",
          "mules",
          "espadrilles",
          "heels",
        ]);
        const wrongShoe = s.items.find(
          (i) =>
            i.category === "shoes" &&
            i.subcategory &&
            OUTDOOR_BAD_SHOES.has(i.subcategory)
        );
        if (wrongShoe) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: ${wrongShoe.subcategory} ("${wrongShoe.name}") not practical for outdoor context`,
          });
          return false;
        }
      }
      // CASUAL HEEL BLOCK — casual / brunch / outdoor / travel / at-home
      // outfits should be flat. Heeled boots in jeans and a tee read
      // overdressed; user has casual shoes for a reason.
      const CASUAL_OCCASIONS = new Set<string>([
        "casual",
        "brunch",
        "outdoor",
        "travel",
        "at-home",
      ]);
      if (CASUAL_OCCASIONS.has(occasion)) {
        const heeledShoe = s.items.find(
          (i) =>
            i.category === "shoes" &&
            (i.heel_type === "high-heel" || i.heel_type === "mid-heel")
        );
        if (heeledShoe) {
          drops.push({
            ids: s._ids,
            reason: `${occasion}: heel_type "${heeledShoe.heel_type}" too dressy for casual context`,
          });
          return false;
        }
      }
      // USER-SET OCCASION/SEASON TAGS — soft-drop when the wardrobe
      // has in-tag alternatives. We push offenders into softMismatch
      // so they're admitted back if the hard-valid pool is too small
      // (otherwise a wardrobe full of seasonally-tagged items would
      // produce zero suggestions). Computed once per category.
      {
        const wardrobeHasInTag = (
          category: string,
          subcategory: string | null,
          checkOccasion: boolean
        ): boolean => {
          return items.some((w) => {
            if (w.is_stored) return false;
            if (w.category !== category) return false;
            if (subcategory && w.subcategory && w.subcategory !== subcategory) return false;
            const tags: string[] = checkOccasion ? w.occasions : w.seasons;
            if (!tags || tags.length === 0) return false;
            return tags.includes(checkOccasion ? occasion : currentSeason);
          });
        };
        let tagOffender:
          | { item: ClothingItem; field: "occasion" | "season" }
          | null = null;
        for (const i of s.items) {
          if (i.occasions && i.occasions.length > 0 && !i.occasions.includes(occasion)) {
            if (wardrobeHasInTag(i.category, i.subcategory, true)) {
              tagOffender = { item: i, field: "occasion" };
              break;
            }
          }
          if (i.seasons && i.seasons.length > 0 && !i.seasons.includes(currentSeason)) {
            if (wardrobeHasInTag(i.category, i.subcategory, false)) {
              tagOffender = { item: i, field: "season" };
              break;
            }
          }
        }
        if (tagOffender) {
          // Soft (deferred), no user-facing tip — the season/occasion
          // tag is the user's own metadata and explaining the relax
          // in-line reads as internal-debug noise.
          if (!pendingSoft) pendingSoft = {};
        }
      }
      // Mood: Cozy → warm-earth palette only. Saturated cool colors
      // (green / teal / turquoise / blue / purple / etc) mixed with
      // warm earth tones (rust / terracotta / camel / brown / etc)
      // creates a palette clash that fights the cozy vibe. Allow
      // saturated cool only when paired with neutrals (no warm earth
      // present in the outfit).
      if (mood === "cozy") {
        const WARM_EARTH = /\b(?:rust|terracotta|tan|camel|beige|brown|khaki|mustard|ochre|burnt|sienna|umber|espresso|chocolate|cognac|amber|copper|caramel)\b/i;
        const SATURATED_COOL = /\b(?:green|teal|turquoise|aqua|cyan|purple|plum|lavender|violet|magenta|fuchsia|emerald|forest|kelly|royal|sapphire)\b/i;
        const hasColorMatch = (item: ClothingItem, re: RegExp) =>
          (item.colors ?? []).some((c) => re.test(c.name));
        const warmItem = s.items.find((i) => hasColorMatch(i, WARM_EARTH));
        const coolItem = s.items.find((i) => hasColorMatch(i, SATURATED_COOL));
        if (warmItem && coolItem) {
          drops.push({
            ids: s._ids,
            reason: `cozy palette clash: "${warmItem.name}" (warm earth) + "${coolItem.name}" (saturated cool)`,
          });
          return false;
        }
      }
      // Mood: Need a Hug → no pointed-toe shoes (too sharp / clinical
      // for the comfort-and-soft-touch vibe).
      if (mood === "sad") {
        const sharpShoe = s.items.find(
          (i) => i.category === "shoes" && i.toe_shape === "pointed"
        );
        if (sharpShoe) {
          drops.push({
            ids: s._ids,
            reason: `Need-a-Hug + pointed-toe shoe ("${sharpShoe.name}")`,
          });
          return false;
        }
      }
      // Mood: Confident → require at least one structured/tailored
      // piece (blazer, sheath dress, tailored trousers). Without one
      // the outfit reads casual or boho, not confident. Wardrobe-aware:
      // skip enforcement if the wardrobe lacks any structured piece.
      if (mood === "confident" && wardrobeHasStructured) {
        const hasStructured = s.items.some(itemIsStructured);
        if (!hasStructured) {
          drops.push({
            ids: s._ids,
            reason: "confident mood + no structured/tailored piece (blazer / sheath / tailored trouser)",
          });
          return false;
        }
      }
      // Mood: Energized → require at least one saturated bright color.
      // An all-neutral palette reads chill or cozy, not energized. The
      // prompt rule explicitly says "no all-neutral palette."
      if (mood === "energized" && wardrobeHasBright) {
        const brightItem = s.items.find(itemHasBright);
        if (!brightItem) {
          drops.push({
            ids: s._ids,
            reason: "energized mood + all-neutral palette (no saturated bright in outfit)",
          });
          return false;
        }
      }
      // Mood: Bold → require at least one statement piece (saturated
      // color OR non-solid pattern OR oversized fit). Bold without a
      // statement reads safe, not bold. Prompt rule: "No safe choices."
      if (mood === "bold" && wardrobeHasStatement) {
        const hasStatement = s.items.some(itemHasStatement);
        if (!hasStatement) {
          drops.push({
            ids: s._ids,
            reason: "bold mood + no statement piece (no bright color, pattern, or oversized fit)",
          });
          return false;
        }
      }
      // Mood: Comfort Day (period) → never heels, never tailored. The
      // prompt states both in rule 13 but this was the only mood with
      // no validator at all — heels on a Comfort Day shipped unchecked.
      if (mood === "period") {
        const heeled = s.items.find(
          (i) =>
            i.category === "shoes" &&
            (i.heel_type === "high-heel" || i.heel_type === "mid-heel")
        );
        if (heeled) {
          drops.push({
            ids: s._ids,
            reason: `comfort-day mood + heeled shoe ("${heeled.name}")`,
          });
          return false;
        }
        const tailored = s.items.find(itemIsTailoredForComfortBan);
        if (tailored) {
          drops.push({
            ids: s._ids,
            reason: `comfort-day mood + tailored piece ("${tailored.name}")`,
          });
          return false;
        }
      }
      // Mood: Chill → no heels. Heels fight the relaxed-easy silhouette
      // the prompt calls for. Other Chill rules (neutral palette,
      // minimal accessories) are too aesthetic for a hard validator.
      if (mood === "chill") {
        const heeled = s.items.find(
          (i) =>
            i.category === "shoes" &&
            (i.heel_type === "high-heel" || i.heel_type === "mid-heel")
        );
        if (heeled) {
          drops.push({
            ids: s._ids,
            reason: `chill mood + heeled shoe ("${heeled.name}")`,
          });
          return false;
        }
      }
      // (At-home scarf rules handled in the map phase via strip-instead-
      // of-drop; the filter doesn't need to re-check them here.)
      // Base completeness — this is structural, always enforced.
      const hasDress = s.items.some((i) => i.category === "dress");
      const hasOnePiece = s.items.some((i) => i.category === "one-piece");
      const hasTop = s.items.some((i) => i.category === "top");
      const hasBottom = s.items.some((i) => i.category === "bottom");
      const isOveralls = s.items.some(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (!hasDress && hasOnePiece) {
        if (isOveralls && !hasTop) {
          drops.push({ ids: s._ids, reason: "overalls without top" });
          return false;
        }
      } else if (!hasDress && !hasOnePiece) {
        if (!(hasTop && hasBottom)) {
          drops.push({ ids: s._ids, reason: "incomplete base" });
          return false;
        }
      }
      // (Cold-weather outerwear is handled by auto-injection in the map
      // phase — if an outfit reaches this filter without outerwear in
      // cold weather, the wardrobe genuinely doesn't have any to inject.)
      // Base-layer weather mismatch: SOFT drop. A mini summer dress (warmth
      // 1-1.5) under a winter coat is still wrong — the coat comes off,
      // the dress doesn't handle 5°C. Require base warmth >= 2 for temp
      // <10°C and >= 2.5 for temp <5°C. Soft-admit back if we'd end under 3.
      if (weather && typeof weather.temp === "number") {
        const baseW = baseWarmth(s.items);
        if (
          (weather.temp < 5 && baseW < 2.5) ||
          (weather.temp < 10 && baseW < 2)
        ) {
          const weatherTip =
            locale === "fr"
              ? "Cette pièce est légère pour le temps — ajoute des collants épais et un manteau chaud."
              : "This piece runs light for the weather — pair with thick tights and a warm coat.";
          if (!pendingSoft) pendingSoft = { tip: weatherTip };
        }
      }
      // R4d — CARDIGAN STANDALONE (HARD drop): a cardigan worn as the
      // only top with no tee/cami/blouse under reads exposed unless
      // it's a fitted, closed-front cardigan worn as a sweater
      // (twinset look). Detects "needs underlayer" via closure (the
      // strongest signal — open-front always needs one), fit, and the
      // is_layering_piece flag. Hard drop forces the AI to retry with
      // an underlayer; soft drop was being admitted back and showing
      // the wrong outfit anyway.
      {
        const tops = s.items.filter((i) => i.category === "top");
        if (tops.length === 1 && tops[0].subcategory === "cardigan") {
          const card = tops[0];
          const needsUnderlayer =
            card.closure === "open-drape" ||
            card.fit === "loose" ||
            card.fit === "oversized" ||
            card.is_layering_piece === true;
          if (needsUnderlayer) {
            drops.push({
              ids: s._ids,
              reason: `cardigan "${card.name}" needs a tee/cami underneath (open-front / loose / layering piece)`,
            });
            return false;
          }
        }
      }
      // R8 — evening dressy material: for date / dinner-out / party /
      // formal, prefer outfits with at least one dressy-material piece
      // (silk / satin / chiffon / lace / velvet / patent-leather). Soft
      // drop — admitted back with a tip when the hard pool is empty,
      // so single-outfit mode never returns nothing just because the
      // AI's pick wasn't dressy. Skip entirely when the wardrobe has
      // no dressy pieces (it's a wardrobe gap). Lives at the end (with
      // the belt-completer) so it only catches outfits that have
      // already passed every hard drop above — admit-back can't sneak
      // a hard-rule violator into final.
      if (
        wardrobeHasDressyMaterial &&
        (occasion === "date" ||
          occasion === "dinner-out" ||
          occasion === "party" ||
          occasion === "formal")
      ) {
        const hasDressy = s.items.some((i) => {
          const mats = Array.isArray(i.material) ? i.material : [i.material];
          return mats.some((m) => m && DRESSY_MATERIALS.has(m as string));
        });
        if (!hasDressy) {
          const dressyTip =
            locale === "fr"
              ? `Pour ${occasion}, une pièce en soie, satin, dentelle ou velours rehausserait l'ensemble.`
              : `For ${occasion}, a silk, satin, lace or velvet piece would elevate the look.`;
          if (!pendingSoft) pendingSoft = { tip: dressyTip };
        }
      }
      // R18 — belt completer (soft, LAST CHECK). Belt-suitability is
      // now derived from item attributes (silhouette / fit / waist) —
      // no manual flag. Lives at the end of the filter so it only
      // catches outfits that pass every hard drop above.
      if (wardrobeHasBelt) {
        const top = s.items.find(
          (i) =>
            i.category === "top" &&
            (i.subcategory === "sweater" || i.subcategory === "blouse") &&
            i.fit !== "oversized"
        );
        const skirt = s.items.find(
          (i) => i.category === "bottom" && i.subcategory === "skirt"
        );
        const tailoredBottom = s.items.find(
          (i) =>
            i.category === "bottom" &&
            i.subcategory === "trousers" &&
            i.waist_style !== "elastic"
        );
        // Belt-friendly dress = silhouette suggests a defined waist
        // moment AND no auto-blockers (slim fit, already-belted waist).
        // Excludes slip / bodycon / mermaid / sheath / shift — those
        // silhouettes fight a belt.
        const beltFriendlySilhouettes = new Set<string>([
          "a-line",
          "wrap",
          "fit-and-flare",
        ]);
        const beltFriendlyDress = s.items.find(
          (i) =>
            (i.category === "dress" || i.category === "one-piece") &&
            i.dress_silhouette &&
            beltFriendlySilhouettes.has(i.dress_silhouette) &&
            i.fit !== "slim" &&
            i.waist_style !== "belted"
        );
        const beltable =
          beltFriendlyDress ||
          (top && (skirt || (top.subcategory === "blouse" && tailoredBottom)));
        const hasBelt = s.items.some(
          (i) => i.category === "accessory" && i.subcategory === "belt"
        );
        const beltExempt =
          mood === "chill" ||
          mood === "cozy" ||
          mood === "period" ||
          occasion === "at-home" ||
          occasion === "outdoor";
        if (beltable && !hasBelt && !beltExempt) {
          // HARD drop when the beltable base is a belt-friendly dress
          // (a-line / wrap / fit-and-flare) — those silhouettes need a
          // defined waist or the look is incomplete. The accessory
          // injector prefers a belt for exactly this base, and the
          // regenerate-with-feedback pass below gives the AI a second
          // chance before any fallback ships beltless.
          // Soft (deferred) for the sweater+skirt / blouse+trousers
          // cases — belt is encouraged but the look isn't broken.
          if (beltFriendlyDress) {
            drops.push({
              ids: s._ids,
              reason: `${beltFriendlyDress.dress_silhouette} dress requires a belt — silhouette demands a defined waist`,
            });
            return false;
          }
          const beltTip =
            locale === "fr"
              ? "Une ceinture marquerait la taille et donnerait du cachet à l'ensemble."
              : "A belt would define the waist and tie the look together.";
          if (!pendingSoft) pendingSoft = { tip: beltTip };
        }
      }
      // Deferred soft drop: only reached when every hard rule passed.
      if (pendingSoft) {
        softMismatch.push({
          outfit: s,
          ...(pendingSoft.tip ? { tip: pendingSoft.tip } : {}),
        });
        return false;
      }
      return true;
      });
      return { valid, drops, softMismatch };
    };

    let { valid: hardValid, drops, softMismatch } = runValidation(mapped);

    // REGENERATE-WITH-FEEDBACK — one bounded retry before any fallback
    // rung fires. When the model's single outfit was hard-dropped, tell
    // it exactly which rules it broke and let it try once more. This is
    // the retry the old comments claimed existed; +1 model call only on
    // full rejection (same daily-cap unit as the shape retry).
    let regenAttempted = false;
    let regenAdopted = false;
    let firstAttemptDrops: string[] = [];
    if (hardValid.length === 0 && softMismatch.length === 0 && mapped.length > 0 && drops.length > 0) {
      regenAttempted = true;
      firstAttemptDrops = drops.map((d) => d.reason);
      const feedback = `\n\nPREVIOUS ATTEMPT REJECTED — the outfit you proposed broke these rules:\n${firstAttemptDrops
        .slice(0, 6)
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n")}\nCompose a DIFFERENT outfit that satisfies every rule above (and all other rules). Do not repeat the rejected combination.`;
      try {
        const r2 = await callAi(feedback);
        if (
          r2.parsed &&
          Array.isArray(r2.parsed.outfits) &&
          r2.parsed.outfits.length > 0
        ) {
          const retryMapped = r2.parsed.outfits.map(buildOutfit);
          const retryRun = runValidation(retryMapped);
          if (retryRun.valid.length > 0 || retryRun.softMismatch.length > 0) {
            // Adopt the retry only when it produced something the normal
            // or soft-admit path can ship — otherwise keep attempt 1 so
            // the fallback ladder works on the original candidate.
            regenAdopted = true;
            mapped = retryMapped;
            hardValid = retryRun.valid;
            drops = retryRun.drops;
            softMismatch = retryRun.softMismatch;
          }
        }
      } catch (err) {
        // Regenerate is best-effort — a transport failure here must not
        // take down the request; the fallback ladder still runs.
        console.warn("[suggest] regenerate-with-feedback failed:", err);
      }
    }

    // Track which item-sets are already in final so admit-back paths
    // (admitSoft, EMERGENCY FALLBACK) can't re-add the same outfit.
    // The legacy exact-set + Jaccard dedup logic was removed 2026-05-08
    // — with single-outfit generation, hardValid has at most 1 entry
    // so cross-candidate dedup is a no-op.
    const seenSets = new Set<string>();
    const final: typeof hardValid = [];
    for (const s of hardValid) {
      const key = [...s._ids].sort().join("|");
      if (seenSets.has(key)) continue;
      seenSets.add(key);
      final.push(s);
    }

    const admitSoft = (bucket: typeof softMismatch) => {
      for (const { outfit: s, tip } of bucket) {
        // Single-outfit ship — admit at most one. Was >= 3 from the
        // legacy 3-outfit architecture; under that, this would have
        // been a "leave room for hard-valid picks" guard.
        if (final.length >= 1) return;
        const key = [...s._ids].sort().join("|");
        if (seenSets.has(key)) continue;
        seenSets.add(key);
        const tipped = {
          ...s,
          styling_tip: tip
            ? s.styling_tip
              ? `${s.styling_tip} ${tip}`
              : tip
            : s.styling_tip,
          relaxed: true,
        };
        final.push(tipped);
      }
    };

    // Telemetry: which rung of the ladder shipped the outfit. Persisted
    // into ai_calls.metadata so rule-rejection rates are measurable
    // without log archaeology.
    let shipPath = "normal";

    // We now generate 1 outfit per call — admit-back fires when the
    // single hard-valid pick was dropped (final.length === 0).
    if (final.length < 1) {
      admitSoft(softMismatch);
      if (final.length > 0) shipPath = "admit_soft";
    }

    // Structural + occasion-ban gate shared by the EMERGENCY FALLBACK
    // and the safety net below — neither path may ship an outfit that
    // fails it. Declared outside the fallback block so the safety net
    // can reuse it.
    const isStructurallyComplete = (s: typeof mapped[number]) => {
        const has = (cat: string) => s.items.some((i) => i.category === cat);
        const hasOveralls = s.items.some(
          (i) => i.category === "one-piece" && i.subcategory === "overalls"
        );
        const baseOK =
          has("dress") ||
          (has("one-piece") && (!hasOveralls || has("top"))) ||
          (has("top") && has("bottom"));
        if (!baseOK) return false;
        if (occasion !== "at-home" && wardrobeHasShoes && !has("shoes")) return false;
        // Reject visually-bad shoe × bottom proportional combos — these
        // are visual failures regardless of wardrobe constraints, so we
        // never want to ship one even as a fallback.
        const shoe = s.items.find((i) => i.category === "shoes");
        const bottom = s.items.find((i) => i.category === "bottom");
        if (shoe && bottom) {
          const sub = shoe.subcategory;
          const fit = bottom.bottom_fit;
          const pl = bottom.pants_length;
          const sh = shoe.shoe_height;
          const tallShaft = sub === "knee-boots" || sh === "knee" || sh === "over-knee";
          if (tallShaft) {
            if (["wide-leg", "flared", "bootcut", "tapered"].includes(fit ?? "")) return false;
          }
          if (sub === "ankle-boots") {
            if (pl === "ankle-crop") return false;
            if (["flared", "bootcut"].includes(fit ?? "") && pl === "full") return false;
          }
          if (sub === "sandals" && pl === "full" && fit === "wide-leg") return false;
          if (
            (sub === "flats" || sub === "ballet-flats") &&
            ["flared", "bootcut"].includes(fit ?? "") &&
            pl === "full"
          ) {
            return false;
          }
        }

        // ── Hard-rule re-validation for the fallback path ──────────────
        // The fallback rescue used to admit outfits that violated occasion
        // bans (sneakers at work, blazer at home), preset rules (all-black
        // ignored), or bag formality (canvas tote at a date). Each check
        // here mirrors a hard drop above. If a candidate fails any of
        // them, skip it — it's better to return zero outfits than ship
        // something the user explicitly asked to avoid.

        // At-home: indoors → no outerwear / shoes / accessory / bag.
        // Mirrors the at-home pre-filter and post-parse strip.
        if (occasion === "at-home") {
          if (s.items.some((i) =>
            i.category === "outerwear" ||
            i.category === "shoes" ||
            i.category === "accessory" ||
            i.category === "bag"
          )) return false;
        }

        // Work: no athletic sneakers, no jeans, no mini skirt, no hat,
        // no hoodie. Mirrors the work pre-filter and post-parse drops.
        // For sneakers and jeans, the user can override by tagging the
        // item for "work" (their workplace allows it). Other rules stay
        // hard regardless of tags.
        if (occasion === "work") {
          if (s.items.some((i) =>
            i.category === "shoes" && i.subcategory === "sneakers" &&
            !(i.occasions ?? []).includes("work")
          )) return false;
          // Track A only — the men's office prompt explicitly allows
          // jeans, and the main filter gates this on gender. The mirror
          // was un-gendered, wrongly rejecting valid men's work outfits.
          if (gender !== "man" && s.items.some((i) =>
            i.category === "bottom" && i.subcategory === "jeans" &&
            !(i.occasions ?? []).includes("work")
          )) return false;
          if (gender !== "man" && s.items.some((i) => i.category === "bottom" && i.subcategory === "skirt" && i.skirt_length === "mini")) return false;
          if (s.items.some((i) => i.category === "accessory" && i.subcategory === "hat")) return false;
          if (s.items.some((i) => i.category === "top" && i.subcategory === "hoodie")) return false;
          // Mirrors of the open-toe and tank-without-blazer drops above.
          if (s.items.some((i) =>
            i.category === "shoes" &&
            (i.toe_shape === "open-toe" || i.toe_shape === "peep-toe" || i.subcategory === "sandals") &&
            !(i.occasions ?? []).includes("work")
          )) return false;
          if (
            !s.items.some((i) => i.subcategory === "blazer") &&
            s.items.some((i) =>
              i.category === "top" && i.subcategory === "tank-top" &&
              !(i.occasions ?? []).includes("work")
            )
          ) return false;
        }

        // Formal / date / party bag rules (mirror the hard drops above):
        // no backpack, no casual material (canvas / nylon), no casual
        // texture (woven / fringed). Two override gates: user-tag (bag
        // explicitly tagged for the occasion) and wardrobe-gap (no
        // qualifying bag in the closet).
        if (
          wardrobeHasFormalBag &&
          (occasion === "formal" || occasion === "date" || occasion === "party")
        ) {
          const bag = s.items.find((i) => i.category === "bag");
          if (bag && !(bag.occasions ?? []).includes(occasion)) {
            if (bag.subcategory === "backpack") return false;
            const mats = Array.isArray(bag.material) ? bag.material : [bag.material];
            const casualMat = mats.some((m) => m === "canvas" || m === "nylon");
            const casualTex = bag.bag_texture === "woven" || bag.bag_texture === "fringed";
            if (casualMat || casualTex) return false;
          }
        }

        // Evening occasions: no casual hat silhouettes (baseball, trucker,
        // bucket). Mirrors the hat-silhouette × occasion drops.
        if (occasion === "formal" || occasion === "date" || occasion === "dinner-out") {
          const hat = s.items.find((i) => i.category === "accessory" && i.subcategory === "hat");
          if (hat) {
            const sil = hat.hat_silhouette ?? "";
            if (["baseball", "trucker", "bucket"].includes(sil)) return false;
          }
        }

        // wantsAllBlack preset: every item in the outfit must be dark.
        if (wantsAllBlack) {
          if (s.items.some((i) => !isDarkItem(i))) return false;
        }

        // Cardigan-standalone (R4d): an open-front / loose / oversized
        // cardigan as the ONLY top reads exposed without a tee under.
        // Mirrors the hard drop in the main filter exactly (same closure
        // and fit conditions) so the fallback never rejects a candidate
        // the main filter would have allowed.
        const tops = s.items.filter((i) => i.category === "top");
        if (tops.length === 1 && tops[0].subcategory === "cardigan") {
          const c = tops[0];
          const exposed =
            c.closure === "open-drape" ||
            c.fit === "loose" ||
            c.fit === "oversized" ||
            c.is_layering_piece === true;
          if (exposed) return false;
        }

        // Pattern-echo cap (R18e). The main filter SOFT-drops these,
        // which means the fallback used to admit them anyway → leopard
        // top + leopard shoes + leopard belt slipped through. Hard-
        // reject 2+ items sharing a statement pattern. Striped/plaid
        // get a pass when they're a deliberate top+bottom suit pairing.
        {
          const STATEMENT_PATTERNS = new Set<string>([
            "animal-print",
            "floral",
            "polka-dot",
            "graphic",
            "embellished",
            "abstract",
            "camo",
          ]);
          const SUIT_PATTERNS = new Set<string>(["striped", "plaid"]);
          const patternCount = new Map<string, ClothingItem[]>();
          for (const it of s.items) {
            const ps = Array.isArray(it.pattern) ? it.pattern : [it.pattern];
            for (const p of ps) {
              if (!p || p === "solid") continue;
              const list = patternCount.get(p) ?? [];
              list.push(it);
              patternCount.set(p, list);
            }
          }
          for (const [p, list] of patternCount) {
            if (list.length < 2) continue;
            if (STATEMENT_PATTERNS.has(p)) return false;
            if (SUIT_PATTERNS.has(p)) {
              const cats = new Set(list.map((i) => i.category));
              const isSuitPair =
                list.length === 2 && cats.has("top") && cats.has("bottom");
              if (!isSuitPair) return false;
            }
          }
        }

        // Denim-on-denim (R4c). Soft-dropped in main filter, used to
        // sneak through here. 2+ items with denim material is the
        // Canadian-tuxedo look — block by default; allow only when
        // user opted in via STYLE DIRECTION ("full denim", etc.).
        if (!wantsDenimOnDenim) {
          const denimItems = s.items.filter((i) => {
            const mats = Array.isArray(i.material) ? i.material : [i.material];
            return mats.some((m) => m === "denim");
          });
          if (denimItems.length >= 2) return false;
        }

        // ── Mirrors added per the audit: the fallback previously skipped
        // all of the following, so sweatpants-on-a-date, suede-in-rain
        // and mixed metals could ship through the emergency path. ──

        // Dress-day / mix-patterns presets (all-black was already
        // mirrored; these two weren't — a "dress day" user could get a
        // no-dress outfit through the fallback).
        if (wantsDressDay && !s.items.some((i) => i.category === "dress")) {
          return false;
        }
        if (wantsMixPatterns) {
          const nonSolid = s.items.filter((i) => {
            const ps = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
            return ps.some((p) => p && p !== "solid");
          }).length;
          if (nonSolid < 2) return false;
        }

        // Casual-wear × dressy occasions (shorts / lounge / hoodie).
        {
          const dressy = new Set(["work", "formal", "dinner-out", "date", "party"]);
          const dressyPlusBrunch = new Set([...dressy, "brunch"]);
          if (dressy.has(occasion) && s.items.some(
            (i) => i.category === "bottom" && i.subcategory === "shorts"
          )) return false;
          if (dressyPlusBrunch.has(occasion) && s.items.some(
            (i) => i.category === "bottom" &&
              (i.subcategory === "sweatpants" || i.subcategory === "leggings")
          )) return false;
          if (dressy.has(occasion) && occasion !== "work" && s.items.some(
            (i) => i.category === "top" && i.subcategory === "hoodie"
          )) return false; // work-hoodie already mirrored above
        }

        // Rain rules: outer-facing rain-blocked materials; outdoor/travel
        // open-toe/high-heel in rain.
        if (rainTriggered) {
          if (s.items.some(
            (i) =>
              (i.category === "outerwear" || i.category === "shoes" || i.category === "bag") &&
              rainBlocked(i)
          )) return false;
          if ((occasion === "outdoor" || occasion === "travel") && s.items.some(
            (i) =>
              i.category === "shoes" &&
              (i.toe_shape === "open-toe" || i.toe_shape === "peep-toe" || i.heel_type === "high-heel")
          )) return false;
        }

        // Metal sync (skip for Playful, bag excluded on men's track —
        // mirrors the main validator's visibility rules).
        if (mood !== "playful") {
          const finishes = s.items
            .filter((i) =>
              i.category === "shoes" ||
              (i.category === "bag" && gender !== "man") ||
              (i.category === "accessory" && i.subcategory === "belt")
            )
            .map(metalFamilyOf)
            .filter((f): f is "gold" | "silver" | "other" => f !== null);
          if (finishes.length >= 2 && new Set(finishes).size > 1) return false;
        }

        // Drop-side mood rules (cheap, prevent visibly-wrong ships). The
        // require-side moods (confident/energized/bold) stay un-mirrored
        // on purpose — in a fallback context they'd zero out users whose
        // compliant items were weather-filtered from the pool.
        if ((mood === "chill" || mood === "period") && s.items.some(
          (i) => i.category === "shoes" &&
            (i.heel_type === "high-heel" || i.heel_type === "mid-heel")
        )) return false;
        if (mood === "period" && s.items.some(itemIsTailoredForComfortBan)) return false;
        if (mood === "sad" && s.items.some(
          (i) => i.category === "shoes" && i.toe_shape === "pointed"
        )) return false;

        // Bag size: formal/date/party want clutch/small; work bans clutch.
        {
          const bag = s.items.find((i) => i.category === "bag");
          if (bag) {
            if (
              (occasion === "formal" || occasion === "date" || occasion === "party") &&
              !(bag.occasions ?? []).includes(occasion) &&
              bag.bag_size && !["clutch", "small"].includes(bag.bag_size)
            ) return false;
            if (occasion === "work" && bag.bag_size === "clutch") return false;
          }
        }

        return true;
      };

    // EMERGENCY FALLBACK: when the regenerate pass also failed and
    // softMismatch is empty, we'd otherwise return zero suggestions.
    // Better to relax the remaining style rules and ship a structurally-
    // complete, occasion-safe outfit (per the gate above) than send the
    // user away empty-handed.
    if (final.length === 0 && mapped.length > 0) {
      // No user-facing caveat in the tip — the AI's styling advice stays
      // intact. The relaxed flag travels on the outfit object for the
      // validator and the results-card notice.
      const candidate = mapped.find(isStructurallyComplete);
      if (candidate) {
        const key = [...candidate._ids].sort().join("|");
        if (!seenSets.has(key)) {
          seenSets.add(key);
          final.push({
            ...candidate,
            relaxed: true,
          });
          shipPath = "emergency";
          drops.push({
            ids: [],
            reason: `EMERGENCY ADMIT: all hard-dropped, admitted 1 structurally-valid candidate`,
          });
        }
      }
    }

    if (softMismatch.length > 0) {
      drops.push({
        ids: [],
        reason: `softMismatch=${softMismatch.length} → final=${final.length}`,
      });
    }

    if (drops.length > 0) {
      console.log(
        `[suggest] returned=${parsedOutfits.length} hard=${hardValid.length} softMismatch=${softMismatch.length} final=${final.length} drops=${JSON.stringify(drops)}`
      );
    }

    // Single-outfit shipping order. With one outfit per call (vs the
    // legacy best-of-3 path), the scorer was a no-op — sorting one
    // element doesn't choose anything. Removed 2026-05-08 to free
    // ~70 lines of vestigial code. The remaining sort just makes
    // sure relaxed-flag outfits (admitted via EMERGENCY FALLBACK or
    // the response-edge safety net) sit AFTER any genuinely hard-
    // valid pick that might have squeaked through.
    const sortedFinal = [...final].sort((a, b) => {
      const aRelaxed = (a as { relaxed?: boolean }).relaxed === true ? 1 : 0;
      const bRelaxed = (b as { relaxed?: boolean }).relaxed === true ? 1 : 0;
      return aRelaxed - bRelaxed;
    });

    // Final structural sanity check — Rule 2: overalls require a top
    // underneath. The main filter (line ~2636) and emergency fallback
    // (line ~2874) both check this, but a real outfit slipped through
    // in beta showing overalls + coat + shoes + cap with no top. Belt-
    // and-suspenders: drop any outfit at the response edge that still
    // has overalls without a top, regardless of how it got here.
    let structurallyValid = sortedFinal.filter((s) => {
      const hasOveralls = s.items.some(
        (i) => i.category === "one-piece" && i.subcategory === "overalls"
      );
      if (!hasOveralls) return true;
      return s.items.some((i) => i.category === "top");
    });

    // Warmth-floor check — Rule 5 spirit, refined to preserve the
    // layered look (sleeveless vest UNDER a coat is encouraged, not
    // blocked). Logic:
    //   - 0 outerwear: not our problem here (auto-injection upstream)
    //   - 2+ outerwear (vest + coat): always allowed — the layered
    //     winter look the prompt explicitly encourages
    //   - 1 outerwear, sleeved: allowed
    //   - 1 outerwear, sleeveless, warmth_rating >= 4: allowed (a
    //     heavy sherpa or quilted vest is dense enough to stand alone)
    //   - 1 outerwear, sleeveless, warmth_rating < 4: blocked — a
    //     thin canvas vest alone at cold temp is the actual mistake
    //
    // Effective temperature shifts by user's temperature_sensitivity
    // setting (runs-cold = -3°C, runs-hot = +3°C) so the runs-cold
    // user actually gets warm outfits, not just told the AI nicely.
    //
    // Tiered thresholds:
    //   - Outdoor + effective <12°C: enforce
    //   - Indoor-leaning (not at-home) + effective <8°C: enforce
    //   - At-home: never enforced (you're inside)
    //
    // Wardrobe-aware: skip if the user owns no qualifying alternative.
    if (typeof temp === "number" && occasion !== "at-home") {
      const tempShift =
        sensitivity === "runs-cold" ? -3 : sensitivity === "runs-hot" ? 3 : 0;
      const effectiveTemp = temp + tempShift;
      const isOutdoor = occasion === "outdoor";
      const enforceCold =
        (isOutdoor && effectiveTemp < 12) ||
        (!isOutdoor && effectiveTemp < 8);
      if (enforceCold) {
        const wardrobeHasWarmAlternative = items.some(
          (i) =>
            !i.is_stored &&
            i.category === "outerwear" &&
            (i.sleeve_length !== "sleeveless" ||
              (i.warmth_rating ?? 0) >= 4)
        );
        if (wardrobeHasWarmAlternative) {
          structurallyValid = structurallyValid.filter((s) => {
            const outerwears = s.items.filter(
              (i) => i.category === "outerwear"
            );
            if (outerwears.length === 0) return true;
            if (outerwears.length >= 2) return true; // layered look
            const single = outerwears[0];
            if (single.sleeve_length !== "sleeveless") return true;
            return (single.warmth_rating ?? 0) >= 4;
          });
        }
      }
    }

    // Pattern-echo cap — Rule 18e. The main filter (line ~2349) does
    // a soft-drop on this, which means with single-outfit generation
    // the EMERGENCY FALLBACK admits the violator anyway. Hard-drop at
    // the response edge: 2+ items sharing a statement pattern
    // (animal-print, floral, polka-dot, graphic, embellished,
    // abstract, camo) is matchy-matchy, not stylist. Striped/plaid
    // get a pass when they're a deliberate top+bottom suit pairing.
    {
      const STATEMENT_PATTERNS = new Set<string>([
        "animal-print",
        "floral",
        "polka-dot",
        "graphic",
        "embellished",
        "abstract",
        "camo",
      ]);
      const SUIT_PATTERNS = new Set<string>(["striped", "plaid"]);
      structurallyValid = structurallyValid.filter((s) => {
        const patternCount = new Map<string, ClothingItem[]>();
        for (const it of s.items) {
          const ps = Array.isArray(it.pattern) ? it.pattern : [it.pattern];
          for (const p of ps) {
            if (!p || p === "solid") continue;
            const list = patternCount.get(p) ?? [];
            list.push(it);
            patternCount.set(p, list);
          }
        }
        for (const [p, list] of patternCount) {
          if (list.length < 2) continue;
          if (STATEMENT_PATTERNS.has(p)) return false;
          if (SUIT_PATTERNS.has(p)) {
            const cats = new Set(list.map((i) => i.category));
            const isSuitPair =
              list.length === 2 && cats.has("top") && cats.has("bottom");
            if (!isSuitPair) return false;
          }
        }
        return true;
      });
    }

    // SAFETY NET — two layers, both now GATED (the audit found the old
    // unconditional layers nullified every upstream validator):
    //   (1) Edge-override: if the response-edge validators (warmth floor,
    //       pattern echo) rejected the only candidate, ship it relaxed —
    //       those are aesthetic/quality calls, not structural ones. The
    //       overalls-without-top check is structural and is NEVER
    //       overridden.
    //   (2) Last resort: the AI's raw mapped output, but only when it
    //       passes the same isStructurallyComplete gate the emergency
    //       fallback uses. If nothing structurally sound exists, return
    //       an honest empty with ai_error — the client shows "try
    //       again", and the regenerate pass above has already given the
    //       model its second chance.
    if (structurallyValid.length === 0) {
      const overallsOk = (s: typeof sortedFinal[number]) => {
        const hasOveralls = s.items.some(
          (i) => i.category === "one-piece" && i.subcategory === "overalls"
        );
        return !hasOveralls || s.items.some((i) => i.category === "top");
      };
      if (sortedFinal.length > 0 && overallsOk(sortedFinal[0])) {
        const relaxed = { ...sortedFinal[0], relaxed: true };
        structurallyValid = [relaxed];
        shipPath = "safety_net_edge_override";
        console.log(
          "[suggest] response-edge validators rejected; shipping relaxed fallback from sortedFinal"
        );
      } else {
        const candidate = mapped.find(
          (s) => isStructurallyComplete(s) && overallsOk(s)
        );
        if (candidate) {
          structurallyValid = [{ ...candidate, relaxed: true }];
          shipPath = "safety_net_raw";
          console.log(
            "[suggest] pipeline rejected; shipping structurally-gated raw candidate as last resort"
          );
        } else {
          console.log(
            "[suggest] nothing structurally sound to ship — returning honest empty (ai_error)"
          );
        }
      }
    }

    // Capture rule telemetry off the shipped outfit BEFORE the audit
    // fields are stripped from the response.
    const shipped = structurallyValid[0];
    const shippedFixes = (shipped?._fixes ?? []).slice(0, 10);
    const anchorShipped = anchorItemId
      ? !!shipped?.items.some((i) => i.id === anchorItemId)
      : null;
    // Distance to the closest recently-shown/worn set. The prompt demands
    // "differ by at least 2 items"; 0-1 here = repetition violation.
    let recentMinDiff: number | null = null;
    if (shipped && allRecentSets.length > 0) {
      const shippedIds = shipped.items.map((i) => i.id);
      for (const set of allRecentSets) {
        const diff = shippedIds.filter((id) => !set.includes(id)).length;
        if (recentMinDiff === null || diff < recentMinDiff) {
          recentMinDiff = diff;
        }
      }
    }

    const suggestions = structurallyValid
      .slice(0, 1)
      .map(({ _fixes: _f, _ids: _ids2, ...rest }) => rest);

    // Scrub wardrobe_gap if the AI suggested a category the user already
    // has populated. Keeps the AI from recommending "a blazer" when the
    // wardrobe already has jackets.
    const userCategoryCounts = items.reduce<Record<string, number>>((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {});
    const GAP_CATEGORY_WORDS: Record<string, string[]> = {
      bottom: ["jeans", "trousers", "pants", "leggings", "sweatpants", "skirt", "chinos", "slacks"],
      dress: ["dress", "gown", "sundress"],
      "one-piece": ["jumpsuit", "overalls", "romper"],
      outerwear: ["jacket", "blazer", "coat", "windbreaker", "puffer", "bomber", "trench", "peacoat", "parka"],
      shoes: ["sneaker", "boot", "heel", "sandal", "loafer"],
      bag: ["handbag", "tote", "backpack", "clutch", "crossbody", "purse"],
    };
    const gapMentionsOwnedCategory = (gap: string): boolean => {
      const lower = gap.toLowerCase();
      for (const [cat, words] of Object.entries(GAP_CATEGORY_WORDS)) {
        if ((userCategoryCounts[cat] ?? 0) === 0) continue;
        for (const w of words) {
          if (new RegExp(`\\b${w}s?\\b`, "i").test(lower)) return true;
        }
      }
      return false;
    };
    const rawGap = parsed.wardrobe_gap ?? null;
    // Sanity-check the value — Gemini occasionally returns a template
    // placeholder (e.g. "A_gap", "{wardrobe_gap}", "missing_item") instead
    // of a real sentence. A real wardrobe-gap line is at least a few
    // words. Anything that looks like an identifier (no spaces, short,
    // snake_case / curly braces / template syntax) gets nulled.
    const looksLikePlaceholder = (s: string): boolean => {
      const trimmed = s.trim();
      if (trimmed.length < 12) return true; // too short to be a sentence
      if (!/\s/.test(trimmed)) return true; // no whitespace = identifier
      if (/^[{<\[]/.test(trimmed)) return true; // template token
      if (/^[a-z_]+$/i.test(trimmed)) return true; // snake_case only
      return false;
    };
    const cleanedGap =
      rawGap && !looksLikePlaceholder(rawGap) ? rawGap : null;
    // Drop the gap line entirely when the AI returned character-
    // corrupted French (é -> `)`, ô -> `"`). No template to fall back
    // to here — null is better than shipping "Un pantalon c\"tel)
    // marron" to the user.
    const gapCorrupted = cleanedGap ? hasFrenchCorruption(cleanedGap) : false;
    const wardrobe_gap = gapCorrupted
      ? null
      : cleanedGap && gapMentionsOwnedCategory(cleanedGap)
        ? null
        : cleanedGap;

    // Remember what we just showed so subsequent "Suggest" clicks bring
    // fresh combinations. Best-effort — a KV hiccup shouldn't block the
    // response.
    if (suggestions.length > 0) {
      const newSets = suggestions.map((s) => s.items.map((i) => i.id));
      const merged = [...newSets, ...kvRecentSuggestions].slice(0, 40);
      // 7-day TTL: short enough that stale bans don't ossify the
      // rotation, long enough that someone suggesting a few times a
      // week keeps a continuous anti-repetition memory.
      kv.set(suggestionsKey, merged, { ex: 60 * 60 * 24 * 7 }).catch(() => {});
    }

    // If we've got nothing to ship AND the wardrobe ISN'T thin (the
    // "wardrobe_gap" explanation handles that case), it's an AI-side
    // failure — every outfit got filtered out. Surface ai_error so
    // the UI shows "try again" instead of the wrong "not enough items"
    // empty state.
    const aiError = suggestions.length === 0 && !wardrobe_gap;
    // The user got nothing — give the attempt back. (A wardrobe_gap
    // response is a real answer and stays charged.)
    if (aiError && capCount !== null && capCount !== -1) {
      refundDailyCap(countKey);
    }
    // Per-request rule telemetry. Without this, a rule rejecting 90%
    // of candidates is invisible outside Vercel console logs. Persisted
    // in ai_calls.metadata; also returned inline for admin debug runs
    // and the Phase 6 rule-compliance harness.
    const rulesTelemetry = {
      ship_path: suggestions.length === 0 ? "none" : shipPath,
      relaxed:
        suggestions.length > 0
          ? (suggestions[0] as { relaxed?: boolean }).relaxed === true
          : null,
      drops: drops.slice(0, 15).map((d) => d.reason.slice(0, 140)),
      soft_mismatch: softMismatch.length,
      regenerate: regenAttempted
        ? {
            adopted: regenAdopted,
            first_attempt_drops: firstAttemptDrops
              .slice(0, 10)
              .map((r) => r.slice(0, 140)),
          }
        : null,
      auto_fixes: shippedFixes,
      anchor_requested: !!anchorItemId,
      anchor_shipped: anchorShipped,
      recent_min_diff: recentMinDiff,
      weather_source: weatherSource,
    };
    logAiCall(supabase, userId, "suggest", {
      succeeded: !aiError,
      metadata: {
        mood,
        occasion,
        outfit_count: suggestions.length,
        rules: rulesTelemetry,
      },
    });
    // DEBUG MODE (?debug=rules) — admin/bypass users only. Returns the
    // rule-check trail inline so a "why did I get this outfit?" report
    // is diagnosable in seconds, and the compliance harness can assert
    // on ship paths instead of reverse-engineering them.
    const wantsDebug =
      request.nextUrl.searchParams.get("debug") === "rules" && isAdmin;
    return NextResponse.json({
      suggestions,
      wardrobe_gap,
      ...(aiError && { ai_error: true }),
      ...(wantsDebug && { _debug_rules: rulesTelemetry }),
    });
  } catch (error) {
    console.error("Suggestion error:", error);
    Sentry.captureException(error);
    if (capCount !== null && capCount !== -1) refundDailyCap(countKey);
    logAiCall(supabase, userId, "suggest", { succeeded: false });
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
