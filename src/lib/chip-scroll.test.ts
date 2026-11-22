import { describe, expect, it } from "vitest";
import { chipCenteringDelta } from "./chip-scroll";

// A 375 px phone row (16 px side padding inside) and chips measured on screen.
const ROW = { left: 0, width: 375 };

describe("chipCenteringDelta", () => {
  it("scrolls right to bring a chip past the right edge into the middle (Stored, the last chip)", () => {
    // "Stored" drawn at 540-620 px, off screen: its centre is 580, the row's 187.5.
    expect(chipCenteringDelta(ROW, { left: 540, width: 80 })).toBe(392.5);
  });

  it("scrolls left for a chip left of the middle", () => {
    expect(chipCenteringDelta(ROW, { left: 16, width: 50 })).toBe(-146.5);
  });

  it("is zero for a chip already in the middle", () => {
    expect(chipCenteringDelta(ROW, { left: 147.5, width: 80 })).toBe(0);
  });

  it("measures from the row's own position on screen", () => {
    expect(chipCenteringDelta({ left: 100, width: 300 }, { left: 400, width: 100 })).toBe(200);
  });
});
