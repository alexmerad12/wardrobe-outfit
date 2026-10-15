import { NextRequest, NextResponse } from "next/server";
import { getWeather } from "@/lib/weather";

// Vercel sets these on every edge/serverless request when deployed.
// In local dev they're absent — we just fall through to the static fallback.
function ipGeoFromHeaders(request: NextRequest): { lat: number; lng: number } | null {
  const lat = parseFloat(request.headers.get("x-vercel-ip-latitude") ?? "");
  const lng = parseFloat(request.headers.get("x-vercel-ip-longitude") ?? "");
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

const FALLBACK = { lat: 48.8566, lng: 2.3522 };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const queryLat = parseFloat(searchParams.get("lat") ?? "");
  const queryLng = parseFloat(searchParams.get("lng") ?? "");

  let lat: number;
  let lng: number;
  let source: "gps" | "ip" | "fallback";

  if (Number.isFinite(queryLat) && Number.isFinite(queryLng)) {
    lat = queryLat;
    lng = queryLng;
    source = "gps";
  } else {
    const ipGeo = ipGeoFromHeaders(request);
    if (ipGeo) {
      ({ lat, lng } = ipGeo);
      source = "ip";
    } else {
      ({ lat, lng } = FALLBACK);
      source = "fallback";
    }
  }

  try {
    const data = await getWeather(lat, lng);
    return NextResponse.json(
      { ...data, source },
      {
        headers: {
          // Open-Meteo's `current` updates ~hourly, so 5-10 min of caching
          // is plenty. Only GPS answers may sit on the shared CDN: their
          // coordinates are in the URL. IP-located (or fallback) answers
          // share the bare /api/weather URL, so a CDN copy would show the
          // first visitor's city to everyone for up to 40 min (audit P2).
          "Cache-Control":
            source === "gps"
              ? "public, max-age=300, s-maxage=600, stale-while-revalidate=1800"
              : "private, max-age=300",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 502 });
  }
}
