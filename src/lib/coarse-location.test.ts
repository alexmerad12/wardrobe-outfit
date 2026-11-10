import { describe, expect, it } from "vitest";
import { coarsen, coarseCoords } from "./coarse-location";

describe("coarse location", () => {
  it("keeps one decimal of a degree", () => {
    expect(coarsen(45.50884)).toBe(45.5);
    expect(coarsen(-73.58781)).toBe(-73.6);
    expect(coarsen(48.8566)).toBe(48.9);
    expect(coarsen(0.04)).toBe(0);
    expect(coarsen(45.5)).toBe(45.5);
  });

  it("turns a browser position into coarse lat / lng", () => {
    expect(coarseCoords({ latitude: 45.50884, longitude: -73.58781 })).toEqual({ lat: 45.5, lng: -73.6 });
  });

  it("never moves a point by more than a twentieth of a degree", () => {
    for (const v of [45.449, 45.451, -73.549, -73.551, 12.3456789]) {
      expect(Math.abs(coarsen(v) - v)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});
