// Reverse geocoding — turn GPS coords (from navigator.geolocation) into
// a human "City, Country" label that matches what our Open-Meteo
// forward-search returns elsewhere.
//
// Provider: BigDataCloud's `reverse-geocode-client` endpoint. It's free,
// requires no API key, and supports a low volume of client-side calls.
// We only call it once per user (when they flip the "follow my location"
// toggle ON), so we stay well inside any rate budget.
//
// Returns null when the call fails for any reason — the caller falls
// back to manual city entry.

export interface ReverseGeocodeResult {
  city: string;
  lat: number;
  lng: number;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  countryName?: string;
  principalSubdivision?: string;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  language: "en" | "fr" = "en",
): Promise<ReverseGeocodeResult | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=${language}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BigDataCloudResponse;
    // BigDataCloud returns city for major cities, locality for smaller
    // places. Fall back to whichever is present so even rural users get
    // a useful label. Country is appended so the saved string matches
    // the format Open-Meteo's forward search returns ("Montreal, Quebec,
    // Canada" style — abbreviated to "City, Country" here for brevity).
    const cityName = data.city || data.locality;
    if (!cityName) return null;
    const country = data.countryName;
    const label = country ? `${cityName}, ${country}` : cityName;
    return { city: label, lat, lng };
  } catch {
    return null;
  }
}
