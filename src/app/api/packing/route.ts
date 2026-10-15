import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { ClothingItem } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { requireActiveSubscription } from "@/lib/require-subscription";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { genAI, FAST_MODEL, FAST_THINKING } from "@/lib/gemini";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";

// Packing list: one text call on the fast tier (src/lib/gemini.ts).
// Weather comes from Open-Meteo (forecast within 10 days, climate
// averages beyond).
export const maxDuration = 60;

// Packing is rare-use (one trip per several weeks for most users) and
// per-call cost is low (about a cent). Tier presets to keep in mind:
//   - Conservative: 1/day
//   - Balanced:     2/day  ← current beta cap
//   - Generous:     3/day  ← future Atelier tier
// Most users won't trigger this once per week, let alone twice per
// day, so the cap mostly guards against runaway client retries.
const PACKING_DAILY_CAP = 2;
const MAX_TRIP_DAYS = 60;
const WEATHER_TIMEOUT_MS = 8_000;

function describeItem(item: ClothingItem): string {
  const parts: string[] = [`[${item.id}]`, item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);
  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);
  const mats = Array.isArray(item.material) ? item.material : [item.material];
  parts.push(`Material: ${mats.join(", ")}`);
  if (item.warmth_rating) parts.push(`Warmth: ${item.warmth_rating}/5`);
  // rain_appropriate not surfaced — handled via material-intelligence
  if (item.is_layering_piece) parts.push("(layering piece)");
  const formalities = Array.isArray(item.formality) ? item.formality : [item.formality];
  parts.push(`Formality: ${formalities.join(", ")}`);
  return parts.join(" | ");
}

const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
const isCoord = (v: unknown, limit: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const asText = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

async function tripWeather(
  request: NextRequest,
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<string> {
  try {
    const start = new Date(startDate);
    // Date-only arithmetic: comparing UTC-midnight start against the
    // current instant made a trip starting TODAY go negative after
    // 12:00 UTC (8am Montréal) and silently lose the real forecast
    // for historical averages (audit P2).
    const daysUntilTrip = Math.round(
      (Date.parse(startDate) - Date.parse(localDayKey(request))) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilTrip <= 10 && daysUntilTrip >= 0) {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&start_date=${startDate}&end_date=${endDate}&timezone=auto`,
        { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) }
      );
      if (res.ok) {
        const days = (await res.json()).daily;
        const temps = days.temperature_2m_max
          .map((max: number, i: number) => `${days.time[i]}: ${days.temperature_2m_min[i]}°-${max}°C, rain ${days.precipitation_probability_max[i]}%`)
          .join("; ");
        return `Forecast: ${temps}`;
      }
    } else {
      const month = String(start.getMonth() + 1).padStart(2, "0");
      const year = start.getFullYear() - 1;
      const res = await fetch(
        `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lng}&start_date=${year}-${month}-01&end_date=${year}-${month}-28&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=EC_Earth3P_HR`,
        { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) }
      );
      if (res.ok) {
        const hist = await res.json();
        const maxTemps: number[] = hist.daily?.temperature_2m_max ?? [];
        const minTemps: number[] = hist.daily?.temperature_2m_min ?? [];
        if (maxTemps.length > 0) {
          const avgHigh = Math.round(maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length);
          const avgLow = Math.round(minTemps.reduce((a, b) => a + b, 0) / minTemps.length);
          return `Historical averages for this period: ${avgLow}°-${avgHigh}°C`;
        }
      }
    }
  } catch {
    // Weather is a nice-to-have: proceed without it.
  }
  return "Weather data unavailable.";
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;
  const subBlock = await requireActiveSubscription(ctx);
  if (subBlock) return subBlock;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { lat, lng, startDate, endDate } = body;
  // Validate BEFORE consuming the cap: a missing date used to send a
  // "NaN days" prompt and still bill the user (audit P2).
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || Date.parse(endDate) < Date.parse(startDate)) {
    return NextResponse.json({ error: "Valid startDate and endDate required" }, { status: 400 });
  }
  // Coordinates are optional: a typed destination without a picked
  // suggestion has none, and the list is still useful without weather.
  const coords = isCoord(lat, 90) && isCoord(lng, 180) ? { lat, lng } : null;
  const tripDays =
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (tripDays > MAX_TRIP_DAYS) {
    return NextResponse.json({ error: `Trips are limited to ${MAX_TRIP_DAYS} days` }, { status: 400 });
  }
  const destination = asText(body.destination, 120) || "the destination";
  const occasions = asText(body.occasions, 300);
  const notes = asText(body.notes, 500);
  const languageName = body.locale === "fr" ? "French" : "English";

  const { data: allItems, error } = await supabase
    .from("clothing_items")
    .select("*")
    .eq("is_stored", false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const items = (allItems ?? []) as ClothingItem[];
  if (items.length < 3) {
    return NextResponse.json({ error: "Add more items to your wardrobe first" }, { status: 400 });
  }

  // Daily-cap gate: consumed only after the free validation exits (so a
  // thin wardrobe doesn't silently eat the 2/day budget — audit C4),
  // refunded when the request fails; admin/tester emails bypass.
  const isAdmin = isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed);
  const countKey = `packing_count:${userId}:${localDayKey(request)}`;
  const capCount = await consumeDailyCap(countKey);
  if (!isAdmin && capCount > PACKING_DAILY_CAP) {
    return NextResponse.json(
      {
        error: "daily_limit_reached",
        limit: PACKING_DAILY_CAP,
        used: Math.min(capCount, PACKING_DAILY_CAP),
      },
      { status: 429 }
    );
  }
  const refund = () => {
    if (capCount !== -1) refundDailyCap(countKey);
  };

  try {
    const weatherInfo = coords
      ? await tripWeather(request, coords.lat, coords.lng, startDate, endDate)
      : "Weather data unavailable.";
    const wardrobeList = items.map(describeItem).join("\n");

    const cachedPrefix = `You are Linette, an expert personal stylist and travel packing advisor. Create a smart packing list from the user's wardrobe for their trip.

WARDROBE:
${wardrobeList}`;

    const dynamicSuffix = `

TRIP DETAILS:
- Destination: ${destination}
- Dates: ${startDate} to ${endDate} (${tripDays} days)
- Weather: ${weatherInfo}
- Planned occasions: ${occasions || "General travel"}
${notes ? `- Notes: ${notes}` : ""}

LANGUAGE: Write all reason, day, note, weather_summary, and packing_tips fields in ${languageName}. Item IDs stay as-is.

PACKING PRINCIPLES:
- Pack versatile pieces that mix and match into multiple outfits
- Consider the weather forecast/averages
- Include layers for temperature changes
- Don't overpack - aim for about 1 outfit per day with mix-and-match potential
- Include appropriate shoes for the occasions
- Consider travel-friendly materials (wrinkle-resistant, lightweight)
- Include rain gear if rain is likely
- Match formality to planned occasions

Respond with ONLY valid JSON:
{
  "packing_list": [
    {
      "item_id": "id",
      "reason": "Short reason why this item is included"
    }
  ],
  "outfit_suggestions": [
    {
      "day": "Day 1 - Arrival",
      "item_ids": ["id1", "id2"],
      "note": "Brief outfit note"
    }
  ],
  "weather_summary": "One sentence summary of expected weather",
  "packing_tips": "One practical packing tip for this trip"
}

Use ONLY item IDs from the wardrobe. Be selective - don't pack the entire wardrobe.`;

    const result = await withGeminiRetry(
      () =>
        genAI.models.generateContent({
          model: FAST_MODEL,
          contents: `${cachedPrefix}\n\n${dynamicSuffix}`,
          config: {
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            thinkingConfig: FAST_THINKING,
          },
        }),
      { tag: "packing" }
    );

    const text = result.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed: {
      packing_list?: { item_id: string; reason: string }[];
      outfit_suggestions?: { day: string; item_ids: string[]; note: string }[];
      weather_summary?: string;
      packing_tips?: string;
    } | null = null;
    try {
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      // Nothing usable came back: give the use back and record it.
      console.error("[packing] Failed to parse Gemini response:", text.slice(0, 200));
      refund();
      logAiCall(supabase, userId, "packing", { succeeded: false });
      return NextResponse.json({ error: "Failed to generate packing list" }, { status: 502 });
    }

    const packingList = (parsed.packing_list ?? [])
      .map((p) => ({ item: items.find((i) => i.id === p.item_id), reason: p.reason }))
      .filter((p) => p.item);
    const outfitSuggestions = (parsed.outfit_suggestions ?? []).map((o) => ({
      day: o.day,
      items: (Array.isArray(o.item_ids) ? o.item_ids : [])
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean),
      note: o.note,
    }));

    logAiCall(supabase, userId, "packing", {
      metadata: {
        destination,
        days: tripDays,
        item_count: packingList.length,
        model: FAST_MODEL,
      },
    });
    return NextResponse.json({
      packing_list: packingList,
      outfit_suggestions: outfitSuggestions,
      weather_summary: parsed.weather_summary ?? null,
      packing_tips: parsed.packing_tips ?? null,
    });
  } catch (error) {
    console.error("Packing list error:", error);
    Sentry.captureException(error);
    refund();
    logAiCall(supabase, userId, "packing", { succeeded: false });
    return NextResponse.json({ error: "Failed to generate packing list" }, { status: 500 });
  }
}
