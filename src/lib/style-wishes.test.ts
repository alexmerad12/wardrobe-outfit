import { describe, expect, it } from "vitest";
import { STYLE_WISH_MAX_CHARS, cleanStyleWishes } from "./style-wishes";

describe("cleanStyleWishes", () => {
  it("keeps what the person typed, tidied", () => {
    expect(cleanStyleWishes(["  First date,   someone I've never met  ", "All black"])).toEqual([
      "First date, someone I've never met",
      "All black",
    ]);
  });

  it("cuts a long text to the box's limit", () => {
    const [text] = cleanStyleWishes(["a".repeat(5000)]);
    expect(text).toHaveLength(STYLE_WISH_MAX_CHARS);
  });

  it("drops what isn't text, empty entries and repeats", () => {
    expect(cleanStyleWishes(["Cozy", "", "   ", 42, null, { a: 1 }, "cozy", "Dress day"])).toEqual(["Cozy", "Dress day"]);
  });

  it("keeps at most twelve wishes", () => {
    expect(cleanStyleWishes(Array.from({ length: 40 }, (_, i) => `wish ${i}`))).toHaveLength(12);
  });

  it("accepts nothing but a list", () => {
    expect(cleanStyleWishes(undefined)).toEqual([]);
    expect(cleanStyleWishes("first date")).toEqual([]);
  });
});
