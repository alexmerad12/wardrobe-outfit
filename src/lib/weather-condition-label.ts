// Maps the English condition strings produced by src/lib/weather.ts to
// the slug keys under "weatherCondition" in the translation files.
// Shared by the weather widget and the outfit cards on home/favorites —
// those cards used to render the raw English string to French users
// (audit Group D).
export const WEATHER_CONDITION_KEYS: Record<string, string> = {
  "Clear sky": "clearSky",
  "Mainly clear": "mainlyClear",
  "Partly cloudy": "partlyCloudy",
  "Overcast": "overcast",
  "Fog": "fog",
  "Depositing rime fog": "rimeFog",
  "Light drizzle": "lightDrizzle",
  "Moderate drizzle": "moderateDrizzle",
  "Dense drizzle": "denseDrizzle",
  "Slight rain": "slightRain",
  "Moderate rain": "moderateRain",
  "Heavy rain": "heavyRain",
  "Slight snow": "slightSnow",
  "Moderate snow": "moderateSnow",
  "Heavy snow": "heavySnow",
  "Snow grains": "snowGrains",
  "Slight rain showers": "slightRainShowers",
  "Moderate rain showers": "moderateRainShowers",
  "Violent rain showers": "violentRainShowers",
  "Slight snow showers": "slightSnowShowers",
  "Heavy snow showers": "heavySnowShowers",
  "Thunderstorm": "thunderstorm",
  "Thunderstorm with slight hail": "thunderstormSlightHail",
  "Thunderstorm with heavy hail": "thunderstormHeavyHail",
};

// Returns the i18n key path for a stored condition string, or null when
// the string is unknown (caller falls back to the raw value).
export function weatherConditionLabelKey(
  condition: string | null | undefined
): string | null {
  if (!condition) return null;
  const slug = WEATHER_CONDITION_KEYS[condition];
  return slug ? `weatherCondition.${slug}` : null;
}
