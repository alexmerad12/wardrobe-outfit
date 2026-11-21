import type { WeatherData } from "./types";

const WEATHER_CODES: Record<number, { condition: string; icon: string }> = {
  0: { condition: "Clear sky", icon: "☀️" },
  1: { condition: "Mainly clear", icon: "🌤️" },
  2: { condition: "Partly cloudy", icon: "⛅" },
  3: { condition: "Overcast", icon: "☁️" },
  45: { condition: "Fog", icon: "🌫️" },
  48: { condition: "Depositing rime fog", icon: "🌫️" },
  51: { condition: "Light drizzle", icon: "🌦️" },
  53: { condition: "Moderate drizzle", icon: "🌦️" },
  55: { condition: "Dense drizzle", icon: "🌧️" },
  61: { condition: "Slight rain", icon: "🌦️" },
  63: { condition: "Moderate rain", icon: "🌧️" },
  65: { condition: "Heavy rain", icon: "🌧️" },
  71: { condition: "Slight snow", icon: "🌨️" },
  73: { condition: "Moderate snow", icon: "🌨️" },
  75: { condition: "Heavy snow", icon: "❄️" },
  77: { condition: "Snow grains", icon: "❄️" },
  80: { condition: "Slight rain showers", icon: "🌦️" },
  81: { condition: "Moderate rain showers", icon: "🌧️" },
  82: { condition: "Violent rain showers", icon: "⛈️" },
  85: { condition: "Slight snow showers", icon: "🌨️" },
  86: { condition: "Heavy snow showers", icon: "❄️" },
  95: { condition: "Thunderstorm", icon: "⛈️" },
  96: { condition: "Thunderstorm with slight hail", icon: "⛈️" },
  99: { condition: "Thunderstorm with heavy hail", icon: "⛈️" },
};

/**
 * Open-Meteo moves its `current` reading every 15 minutes, so a fresh answer
 * is at most about 15 minutes old. An older one is a leftover of Next's data
 * cache: it hands back its last copy first, however old, and only refreshes
 * it in the background. On 2026-11-21 production answered Montreal at 1 PM
 * with the 9 AM reading (7°C, partly cloudy, instead of 11°C and clear), and
 * Style Me styles with whatever this returns (known-root-causes.md).
 */
export const MAX_READING_AGE_MS = 30 * 60_000;

/**
 * How old an Open-Meteo answer's `current` reading is, in milliseconds, or
 * null when the answer doesn't say. With `timezone=auto`, `current.time` is
 * the place's local wall time ("2026-11-21T13:00") and `utc_offset_seconds`
 * turns it back into an instant.
 */
export function readingAgeMs(answer: unknown, now: number = Date.now()): number | null {
  const a = answer as { current?: { time?: unknown }; utc_offset_seconds?: unknown } | null | undefined;
  const time = a?.current?.time;
  const offset = a?.utc_offset_seconds;
  if (typeof time !== "string" || typeof offset !== "number") return null;
  const wallTimeAsUtc = Date.parse(`${time}Z`);
  if (!Number.isFinite(wallTimeAsUtc)) return null;
  return now - (wallTimeAsUtc - offset * 1000);
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData> {
  // Round to 2 decimals (~1.1 km precision) so nearby users share the cache key
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=precipitation_probability_max,uv_index_max&timezone=auto`;

  // One retry. Suggest styles without weather when this throws (no rain
  // or temperature rule runs), and a short Open-Meteo blip did that to 4
  // requests in a row on 2026-10-16: canvas boots for a rainy work day.
  // Both failures are logged, the caller only saw "no weather" before.
  try {
    return await fetchWeather(url, 5_000);
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      return await fetchWeather(url, 4_000);
    } catch (second) {
      const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
      console.warn(`[weather] Open-Meteo failed twice: ${msg(first)} / ${msg(second)}`);
      throw second;
    }
  }
}

async function fetchWeather(url: string, timeoutMs: number): Promise<WeatherData> {
  // Kept 5 min in Next's data cache, so a burst of requests for one place
  // asks Open-Meteo once. That cache answers with its last copy even when
  // it is hours old, so a reading past MAX_READING_AGE_MS is asked for
  // again, uncached (the cache still refreshes itself in the background).
  let data = await fetchOpenMeteo(url, { next: { revalidate: 300 } }, timeoutMs);
  const age = readingAgeMs(data);
  if (age !== null && age > MAX_READING_AGE_MS) {
    data = await fetchOpenMeteo(url, { cache: "no-store" }, timeoutMs);
  }

  const current = data?.current;
  const daily = data?.daily;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("Weather answer without current conditions");
  }

  const weatherCode = current.weather_code as number;
  const weatherInfo = WEATHER_CODES[weatherCode] ?? { condition: "Unknown", icon: "🌡️" };

  return {
    temp: Math.round(current.temperature_2m),
    feels_like: Math.round(current.apparent_temperature),
    condition: weatherInfo.condition,
    icon: weatherInfo.icon,
    humidity: current.relative_humidity_2m,
    wind_speed: Math.round(current.wind_speed_10m),
    precipitation_probability: daily?.precipitation_probability_max?.[0] ?? 0,
    uv_index: daily?.uv_index_max?.[0] ?? 0,
    location: "",
  };
}

// Timeout per attempt (5 s, then 4 s): a stalled upstream used to hold the
// caller (the weather route, or suggest mid-request) until the platform
// timeout.
// The JSON is checked field by field by the caller.
async function fetchOpenMeteo(url: string, init: RequestInit, timeoutMs: number) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Failed to fetch weather data (HTTP ${response.status})`);
  }
  return response.json();
}

export function getSeasonFromMonth(month: number): "spring" | "summer" | "fall" | "winter" {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}
