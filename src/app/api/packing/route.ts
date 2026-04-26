import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { ClothingItem } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { withGeminiRetry } from "@/lib/gemini-retry";

// Packing endpoint runs on Gemini 3 Flash Preview via @google/genai
// with thinking disabled. Same setup as suggest, analyze, and try-on.
// GOOGLE_API_KEY must be set in env.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

function describeItem(item: ClothingItem): string {
  const parts: string[] = [`[${item.id}]`, item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);
  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);
  const mats = Array.isArray(item.material) ? item.material : [item.material];
  parts.push(`Material: ${mats.join(", ")}`);
  if (item.warmth_rating) parts.push(`Warmth: ${item.warmth_rating}/5`);
  if (item.rain_appropriate) parts.push("Rain-proof");
  if (item.is_layering_piece) parts.push("(layering piece)");
  const formalities = Array.isArray(item.formality) ? item.formality : [item.formality];
  parts.push(`Formality: ${formalities.join(", ")}`);
  return parts.join(" | ");
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  try {
    const { destination, lat, lng, startDate, endDate, occasions, notes, locale = "en" } = await request.json();
    const languageName = locale === "fr" ? "French" : "English";

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

    let weatherInfo = "Weather data unavailable.";
    try {
      const start = new Date(startDate);
      const now = new Date();
      const daysUntilTrip = Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilTrip <= 10 && daysUntilTrip >= 0) {
        const forecastRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&start_date=${startDate}&end_date=${endDate}&timezone=auto`
        );
        if (forecastRes.ok) {
          const forecast = await forecastRes.json();
          const days = forecast.daily;
          const temps = days.temperature_2m_max.map((max: number, i: number) =>
            `${days.time[i]}: ${days.temperature_2m_min[i]}°-${max}°C, rain ${days.precipitation_probability_max[i]}%`
          ).join("; ");
          weatherInfo = `Forecast: ${temps}`;
        }
      } else {
        const month = start.getMonth() + 1;
        const historicalRes = await fetch(
          `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lng}&start_date=${start.getFullYear() - 1}-${String(month).padStart(2, "0")}-01&end_date=${start.getFullYear() - 1}-${String(month).padStart(2, "0")}-28&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=EC_Earth3P_HR`
        );
        if (historicalRes.ok) {
          const hist = await historicalRes.json();
          const maxTemps = hist.daily?.temperature_2m_max ?? [];
          const minTemps = hist.daily?.temperature_2m_min ?? [];
          if (maxTemps.length > 0) {
            const avgHigh = Math.round(maxTemps.reduce((a: number, b: number) => a + b, 0) / maxTemps.length);
            const avgLow = Math.round(minTemps.reduce((a: number, b: number) => a + b, 0) / minTemps.length);
            weatherInfo = `Historical averages for this period: ${avgLow}°-${avgHigh}°C`;
          }
        }
      }
    } catch {
      // proceed without weather
    }

    const tripDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const wardrobeList = items.map(describeItem).join("\n");

    const cachedPrefix = `You are Yav, an expert personal stylist and travel packing advisor. Create a smart packing list from the user's wardrobe for their trip.

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
          model: "gemini-3-flash-preview",
          contents: `${cachedPrefix}\n\n${dynamicSuffix}`,
          config: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      { tag: "packing" }
    );

    const text = result.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("[packing] Failed to parse Gemini response:", text.slice(0, 200));
      return NextResponse.json({ error: "Failed to generate packing list" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const packingList = (parsed.packing_list ?? []).map((p: { item_id: string; reason: string }) => ({
      item: items.find((i) => i.id === p.item_id),
      reason: p.reason,
    })).filter((p: { item: ClothingItem | undefined }) => p.item);

    const outfitSuggestions = (parsed.outfit_suggestions ?? []).map((o: { day: string; item_ids: string[]; note: string }) => ({
      day: o.day,
      items: o.item_ids.map((id) => items.find((i) => i.id === id)).filter(Boolean),
      note: o.note,
    }));

    return NextResponse.json({
      packing_list: packingList,
      outfit_suggestions: outfitSuggestions,
      weather_summary: parsed.weather_summary ?? null,
      packing_tips: parsed.packing_tips ?? null,
    });
  } catch (error) {
    console.error("Packing list error:", error);
    return NextResponse.json({ error: "Failed to generate packing list" }, { status: 500 });
  }
}
