// The trip planner's answer from Gemini, turned into the pieces of THIS
// wardrobe (src/app/api/packing/route.ts). Pure, so it is tested on its own.
//
// The prompt lists every piece as "[<uuid>] name | ...". The model answers
// with those ids, and a piece is only shown when its id matches the
// wardrobe: never trust an id the model wrote (CLAUDE.md, AI endpoints).
// On 2026-11-16 one answer of about fifteen matched no piece at all and the
// screen said "0 items to pack" while the use was spent. The route now
// treats such an answer like one that isn't JSON (packingAnswerUsable):
// asked again once, then refused with the use given back.

export type PackingAnswer = {
  packing_list?: unknown;
  outfit_suggestions?: unknown;
  weather_summary?: unknown;
  packing_tips?: unknown;
};

/** An id as the model wrote it, made comparable: "[ID]" or " id " -> "id". */
export function cleanItemId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim().toLowerCase();
  return id || null;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const field = (o: unknown, key: string): unknown =>
  o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined;

export function matchPackingAnswer<T extends { id: string }>(answer: PackingAnswer, items: readonly T[]) {
  const byId = new Map(items.map((item) => [item.id.toLowerCase(), item]));
  const find = (raw: unknown) => {
    const id = cleanItemId(raw);
    return id ? byId.get(id) : undefined;
  };

  const seen = new Set<string>();
  const packingList: { item: T; reason: string }[] = [];
  // What the model wrote that matched nothing, for the log (ids only).
  const unknownIds: string[] = [];
  for (const entry of list(answer.packing_list)) {
    const raw = field(entry, "item_id");
    const item = find(raw);
    if (!item) {
      unknownIds.push(String(raw).slice(0, 60));
      continue;
    }
    // The same piece named twice is shown once.
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    packingList.push({ item, reason: text(field(entry, "reason")) });
  }

  const outfitSuggestions = list(answer.outfit_suggestions).map((day) => ({
    day: text(field(day, "day")),
    items: list(field(day, "item_ids"))
      .map(find)
      .filter((item): item is T => item !== undefined),
    note: text(field(day, "note")),
  }));

  return {
    packingList,
    outfitSuggestions,
    unknownIds,
    weatherSummary: text(answer.weather_summary) || null,
    packingTips: text(answer.packing_tips) || null,
  };
}

/** An answer worth showing names at least one piece of the wardrobe. */
export function packingAnswerUsable(matched: { packingList: readonly unknown[] }): boolean {
  return matched.packingList.length > 0;
}
