import { afterEach, describe, expect, it, vi } from "vitest";
import { getWeather, getSeasonFromMonth } from "./weather";

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

describe("getSeasonFromMonth", () => {
  it("maps months to northern-hemisphere seasons", () => {
    expect(getSeasonFromMonth(10)).toBe("fall");
    expect(getSeasonFromMonth(1)).toBe("winter");
    expect(getSeasonFromMonth(7)).toBe("summer");
    expect(getSeasonFromMonth(4)).toBe("spring");
  });
});
