import { describe, expect, it } from "vitest";
import {
  WARDROBE_RETURN_TTL_MS,
  parseWardrobeReturn,
  restoredScrollY,
  wardrobeViewKey,
} from "./wardrobe-return";

const NOW = 1_800_000_000_000;

function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    view: "all|all",
    itemId: "item-17",
    cardTop: 240,
    scrollY: 2100,
    at: NOW - 5_000,
    ...overrides,
  });
}

describe("wardrobeViewKey", () => {
  it("tells tabs and drill-downs apart", () => {
    expect(wardrobeViewKey("all", "all")).toBe("all|all");
    expect(wardrobeViewKey("top", "shirt")).not.toBe(wardrobeViewKey("top", "all"));
  });
});

describe("parseWardrobeReturn", () => {
  it("reads a fresh record", () => {
    expect(parseWardrobeReturn(record(), NOW)).toEqual({
      view: "all|all",
      itemId: "item-17",
      cardTop: 240,
      scrollY: 2100,
      at: NOW - 5_000,
    });
  });

  it("ignores nothing, broken JSON and the wrong shape", () => {
    expect(parseWardrobeReturn(null, NOW)).toBeNull();
    expect(parseWardrobeReturn("", NOW)).toBeNull();
    expect(parseWardrobeReturn("{not json", NOW)).toBeNull();
    expect(parseWardrobeReturn("42", NOW)).toBeNull();
    expect(parseWardrobeReturn("null", NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ itemId: "" }), NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ itemId: 17 }), NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ view: undefined }), NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ scrollY: "2100" }), NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ cardTop: null }), NOW)).toBeNull();
  });

  it("ignores a record older than the time limit, or from the future", () => {
    expect(parseWardrobeReturn(record({ at: NOW - WARDROBE_RETURN_TTL_MS }), NOW)).not.toBeNull();
    expect(parseWardrobeReturn(record({ at: NOW - WARDROBE_RETURN_TTL_MS - 1 }), NOW)).toBeNull();
    expect(parseWardrobeReturn(record({ at: NOW + 120_000 }), NOW)).toBeNull();
  });
});

describe("restoredScrollY", () => {
  const saved = { cardTop: 240, scrollY: 2100 };

  it("puts the card back at the same distance from the top of the window", () => {
    // The card now starts 2340 px down the page: scroll so it sits 240 px down
    // the window again.
    expect(restoredScrollY(saved, 2340, 5000)).toBe(2100);
    // Pieces were added above it since: the card moved down, so does the page.
    expect(restoredScrollY(saved, 2700, 5000)).toBe(2460);
  });

  it("falls back to the old scroll position when the card is gone", () => {
    expect(restoredScrollY(saved, null, 5000)).toBe(2100);
  });

  it("stays inside the page", () => {
    expect(restoredScrollY(saved, null, 1500)).toBe(1500);
    expect(restoredScrollY(saved, 100, 5000)).toBe(0);
    expect(restoredScrollY(saved, 2340, -20)).toBe(0);
  });

  it("rounds to whole pixels", () => {
    expect(restoredScrollY({ cardTop: 240.4, scrollY: 0 }, 2340.9, 5000)).toBe(2101);
  });
});
