import { describe, expect, it } from "vitest";
import { cleanItemId, matchPackingAnswer, packingAnswerUsable } from "./packing-answer";

const A = { id: "3f0c1a52-9a7e-4a57-9d0f-6d1c2b3a4e5f", name: "Trench" };
const B = { id: "0b9d7c1e-2f3a-4b5c-8d6e-7f8a9b0c1d2e", name: "Boots" };
const items = [A, B];

describe("cleanItemId", () => {
  it("takes off the brackets the prompt puts around ids, spaces and case", () => {
    expect(cleanItemId(`[${A.id}]`)).toBe(A.id);
    expect(cleanItemId(`  ${A.id.toUpperCase()} `)).toBe(A.id);
    expect(cleanItemId(`[[${A.id}]]`)).toBe(A.id);
  });
  it("gives nothing for what is not an id", () => {
    expect(cleanItemId(42)).toBeNull();
    expect(cleanItemId("  ")).toBeNull();
    expect(cleanItemId("[]")).toBeNull();
    expect(cleanItemId(undefined)).toBeNull();
  });
});

describe("matchPackingAnswer", () => {
  it("keeps the pieces of this wardrobe, once each, with their reason", () => {
    const m = matchPackingAnswer(
      {
        packing_list: [
          { item_id: A.id, reason: "Rain" },
          { item_id: `[${B.id}]`, reason: "Cobblestones" },
          { item_id: A.id, reason: "again" },
          { item_id: "not-a-piece", reason: "?" },
        ],
      },
      items,
    );
    expect(m.packingList).toEqual([
      { item: A, reason: "Rain" },
      { item: B, reason: "Cobblestones" },
    ]);
    expect(m.unknownIds).toEqual(["not-a-piece"]);
    expect(packingAnswerUsable(m)).toBe(true);
  });

  it("builds the day plan from matching ids only", () => {
    const m = matchPackingAnswer(
      {
        packing_list: [{ item_id: A.id, reason: "r" }],
        outfit_suggestions: [
          { day: "Day 1", item_ids: [A.id, "ghost", B.id.toUpperCase()], note: "n" },
          { day: "Day 2", item_ids: "not a list" },
          "garbage",
        ],
      },
      items,
    );
    expect(m.outfitSuggestions).toEqual([
      { day: "Day 1", items: [A, B], note: "n" },
      { day: "Day 2", items: [], note: "" },
      { day: "", items: [], note: "" },
    ]);
  });

  it("an answer that names no piece of the wardrobe is not usable", () => {
    for (const answer of [
      { packing_list: [] },
      {},
      { packing_list: "nothing" },
      { packing_list: [{ item_id: "Trench" }, { reason: "no id" }] },
    ]) {
      expect(packingAnswerUsable(matchPackingAnswer(answer, items))).toBe(false);
    }
  });

  it("keeps the weather line and the tip only when they are text", () => {
    const m = matchPackingAnswer({ packing_list: [], weather_summary: "Mild", packing_tips: 3 }, items);
    expect(m.weatherSummary).toBe("Mild");
    expect(m.packingTips).toBeNull();
  });
});
