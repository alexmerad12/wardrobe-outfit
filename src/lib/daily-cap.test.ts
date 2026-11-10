import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kv", () => ({ kv: () => ({}) }));

import { localDayKey, localMonthKey } from "./daily-cap";

const request = (tz: string | null) => ({
  headers: { get: (name: string) => (name === "x-vercel-ip-timezone" ? tz : null) },
});

describe("cap keys", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the month key is the month of the day key", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    for (const tz of ["America/Toronto", "Pacific/Auckland", null, "Not/AZone"]) {
      const day = localDayKey(request(tz));
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(localMonthKey(request(tz))).toBe(day.slice(0, 7));
    }
  });

  it("the month turns over in the user's timezone, not at UTC midnight", () => {
    vi.useFakeTimers();
    // 03:30 UTC on Dec 1 is still the evening of Nov 30 in Montreal.
    vi.setSystemTime(new Date("2026-12-01T03:30:00Z"));
    expect(localMonthKey(request("America/Toronto"))).toBe("2026-11");
    expect(localMonthKey(request("Europe/Paris"))).toBe("2026-12");
    expect(localMonthKey(request(null))).toBe("2026-12");
  });
});
