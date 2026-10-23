import { describe, expect, it } from "vitest";
import { hideBottomNav, isBottomNavHidden } from "./bottom-nav-visibility";

describe("hideBottomNav", () => {
  it("hides until released", () => {
    expect(isBottomNavHidden()).toBe(false);
    const release = hideBottomNav();
    expect(isBottomNavHidden()).toBe(true);
    release();
    expect(isBottomNavHidden()).toBe(false);
  });

  it("stays hidden while any caller still holds it, and a double release counts once", () => {
    const a = hideBottomNav();
    const b = hideBottomNav();
    a();
    a();
    expect(isBottomNavHidden()).toBe(true);
    b();
    expect(isBottomNavHidden()).toBe(false);
  });
});
