import { describe, expect, it } from "vitest";
import { userKeyPattern } from "./user-keys";

const USER = "1050bf5f-24e2-4489-bd45-109730be5b8c";

// Turns the pattern into the test Redis applies (only * is special here).
const matches = (pattern: string, key: string) =>
  new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(key);

describe("userKeyPattern", () => {
  it("matches every key the app writes for a user", () => {
    const pattern = userKeyPattern(USER)!;
    for (const key of [
      `suggest_count:${USER}:2026-11-13`,
      `refine_count:${USER}:2026-11-13`,
      `packing_count:${USER}:2026-11-13`,
      `analyze_count:${USER}:2026-11-13`,
      `normalize_count:${USER}:2026-11-13`,
      `report_count:${USER}:2026-11-13`,
      `feedback_count:${USER}:2026-11-13`,
      `tryon_count:${USER}:2026-11`,
      `recent-suggestions:${USER}`,
      `items_uploaded:${USER}`,
    ]) {
      expect(matches(pattern, key), key).toBe(true);
    }
  });

  it("leaves other users' keys alone", () => {
    const pattern = userKeyPattern(USER)!;
    expect(matches(pattern, "suggest_count:2c1d3f6a-0000-4000-8000-000000000000:2026-11-13")).toBe(false);
    expect(matches(pattern, "recent-suggestions:2c1d3f6a-0000-4000-8000-000000000000")).toBe(false);
  });

  it("refuses anything that is not a user id, so a delete can never go wide", () => {
    expect(userKeyPattern("")).toBeNull();
    expect(userKeyPattern("*")).toBeNull();
    expect(userKeyPattern("abc")).toBeNull();
    expect(userKeyPattern(`${USER}*`)).toBeNull();
  });
});
