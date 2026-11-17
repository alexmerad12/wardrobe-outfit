import { describe, expect, it } from "vitest";
import { orderChipsByContent } from "./filter-chips";

const chips = [
  { key: "all", count: 5 },
  { key: "custom", count: 0 },
  { key: "home", count: 2 },
  { key: "casual", count: 3 },
  { key: "work", count: 0 },
  { key: "brunch", count: 1 },
];

describe("orderChipsByContent", () => {
  it("keeps the first chip first, then the chips with content in their order, then the empty ones", () => {
    expect(orderChipsByContent(chips).map((c) => c.key)).toEqual(["all", "home", "casual", "brunch", "custom", "work"]);
  });

  it("marks the empty chips", () => {
    const ordered = orderChipsByContent(chips);
    expect(ordered.filter((c) => c.empty).map((c) => c.key)).toEqual(["custom", "work"]);
    expect(ordered[0].empty).toBe(false);
  });

  it("keeps the first chip first even when it is empty", () => {
    expect(orderChipsByContent([{ key: "all", count: 0 }, { key: "work", count: 1 }]).map((c) => [c.key, c.empty])).toEqual([
      ["all", true],
      ["work", false],
    ]);
  });

  it("changes nothing when every chip has content", () => {
    const full = chips.map((c) => ({ ...c, count: 1 }));
    expect(orderChipsByContent(full).map((c) => c.key)).toEqual(full.map((c) => c.key));
  });

  it("handles an empty list", () => {
    expect(orderChipsByContent([])).toEqual([]);
  });
});
