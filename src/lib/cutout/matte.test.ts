import { describe, expect, it } from "vitest";
import { minLogits, mirrorPlane, mirrorRgb } from "./matte";

describe("mirror pass helpers", () => {
  it("mirrors an RGB image left to right, row by row", () => {
    // 3x2 image: pixel value = its index, so the swap is easy to read.
    const rgb = Uint8Array.from([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
      4, 4, 4, 5, 5, 5, 6, 6, 6,
    ]);
    expect(Array.from(mirrorRgb(rgb, 3, 2))).toEqual([
      3, 3, 3, 2, 2, 2, 1, 1, 1,
      6, 6, 6, 5, 5, 5, 4, 4, 4,
    ]);
  });

  it("mirrors a plane back to where it came from", () => {
    const plane = Float32Array.from([1, 2, 3, 4, 5, 6]);
    expect(Array.from(mirrorPlane(plane, 3, 2))).toEqual([3, 2, 1, 6, 5, 4]);
    expect(Array.from(mirrorPlane(mirrorPlane(plane, 3, 2), 3, 2))).toEqual(Array.from(plane));
  });

  it("keeps a pixel only as far as both passes do", () => {
    const direct = Float32Array.from([5, -3, 2, 0]);
    const mirrored = Float32Array.from([4, 1, -2, 0]);
    expect(Array.from(minLogits(direct, mirrored))).toEqual([4, -3, -2, 0]);
  });
});
