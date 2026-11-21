import { afterEach, describe, expect, it, vi } from "vitest";
import { getWeather, getSeasonFromMonth, MAX_READING_AGE_MS, readingAgeMs } from "./weather";

const OPEN_METEO_ANSWER = {
  current: { temperature_2m: 8.6, apparent_temperature: 5.5, weather_code: 61, relative_humidity_2m: 88, wind_speed_10m: 14.4 },
  daily: { precipitation_probability_max: [100], uv_index_max: [1.2] },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getWeather", () => {
  it("maps Open-Meteo's answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_METEO_ANSWER)));
    const w = await getWeather(45.5017, -73.5673);
    expect(w).toMatchObject({ temp: 9, feels_like: 6, condition: "Slight rain", humidity: 88, wind_speed: 14, precipitation_probability: 100 });
  });

  it("retries once after a blip (suggest used to style without weather)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(OPEN_METEO_ANSWER));
    vi.stubGlobal("fetch", fetchMock);
    const w = await getWeather(45.5, -73.57);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(w.temp).toBe(9);
  });

  it("treats an answer without current conditions as a failure, and logs a double failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: true, reason: "rate limited" }, 200))
    );
    await expect(getWeather(45.5, -73.57)).rejects.toThrow(/current conditions/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[weather] Open-Meteo failed twice"));
  });
});

/** An Open-Meteo answer whose reading is `minutesOld` old, in UTC (offset 0). */
function answerFrom(minutesOld: number, temperature: number) {
  const time = new Date(Date.now() - minutesOld * 60_000).toISOString().slice(0, 16);
  return {
    utc_offset_seconds: 0,
    current: { ...OPEN_METEO_ANSWER.current, time, temperature_2m: temperature },
    daily: OPEN_METEO_ANSWER.daily,
  };
}

describe("readingAgeMs", () => {
  it("reads the place's local time back into an instant (Montreal, UTC-5)", () => {
    const answer = { utc_offset_seconds: -18_000, current: { time: "2026-11-21T13:00" } };
    expect(readingAgeMs(answer, Date.UTC(2026, 10, 21, 18, 10))).toBe(10 * 60_000);
  });

  it("works east of Greenwich too (Paris, UTC+1)", () => {
    const answer = { utc_offset_seconds: 3_600, current: { time: "2026-11-21T09:00" } };
    expect(readingAgeMs(answer, Date.UTC(2026, 10, 21, 12, 0))).toBe(4 * 3_600_000);
  });

  it("says nothing when the answer carries no time or offset", () => {
    expect(readingAgeMs(OPEN_METEO_ANSWER)).toBeNull();
    expect(readingAgeMs({ utc_offset_seconds: 0, current: { time: "not a time" } })).toBeNull();
    expect(readingAgeMs(null)).toBeNull();
  });
});

describe("getWeather and Next's data cache (production served 9 AM's weather at 1 PM, 2026-11-21)", () => {
  it("asks again, uncached, when the cached reading is too old", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answerFrom(4 * 60, 7)))
      .mockResolvedValueOnce(jsonResponse(answerFrom(5, 11)));
    vi.stubGlobal("fetch", fetchMock);
    const w = await getWeather(45.5, -73.6);
    expect(w.temp).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 300 } });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: "no-store" });
  });

  it("keeps a recent cached reading without asking again", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(answerFrom(10, 11)));
    vi.stubGlobal("fetch", fetchMock);
    const w = await getWeather(45.5, -73.6);
    expect(w.temp).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("draws the line at 30 minutes, past Open-Meteo's 15-minute step", () => {
    expect(MAX_READING_AGE_MS).toBe(30 * 60_000);
  });
});

describe("getSeasonFromMonth", () => {
  it("maps months to northern-hemisphere seasons", () => {
    expect(getSeasonFromMonth(10)).toBe("fall");
    expect(getSeasonFromMonth(1)).toBe("winter");
    expect(getSeasonFromMonth(7)).toBe("summer");
    expect(getSeasonFromMonth(4)).toBe("spring");
  });
});
