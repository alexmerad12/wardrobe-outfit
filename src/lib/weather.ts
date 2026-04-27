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

export async function getWeather(lat: number, lng: number): Promise<WeatherData> {
  // Round to 2 decimals (~1.1 km precision) so nearby users share the cache key
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=precipitation_probability_max,uv_index_max&timezone=auto`;

  // Revalidate every 10 min — Open-Meteo's `current` updates hourly so
  // shorter than this is wasted; longer than this lets the morning temp
  // bleed into the afternoon view (5°C swing in spring).
  const response = await fetch(url, { next: { revalidate: 600 } });
  if (!response.ok) {
    throw new Error("Failed to fetch weather data");
  }

  const data = await response.json();
  const current = data.current;
  const daily = data.daily;

  const weatherCode = current.weather_code as number;
  const weatherInfo = WEATHER_CODES[weatherCode] ?? { condition: "Unknown", icon: "🌡️" };

  return {
    temp: Math.round(current.temperature_2m),
    feels_like: Math.round(current.apparent_temperature),
    condition: weatherInfo.condition,
    icon: weatherInfo.icon,
    humidity: current.relative_humidity_2m,
    wind_speed: Math.round(current.wind_speed_10m),
    precipitation_probability: daily.precipitation_probability_max?.[0] ?? 0,
    uv_index: daily.uv_index_max?.[0] ?? 0,
    location: "",
  };
}

export function getSeasonFromMonth(month: number): "spring" | "summer" | "fall" | "winter" {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}
