import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/server-storage";
import Anthropic from "@anthropic-ai/sdk";
import type { ClothingItem } from "@/lib/types";

const anthropic = new Anthropic();

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
  try {
    const { destination, lat, lng, startDate, endDate, occasions, notes } = await request.json();

    const data = await readData();
    const items = data.items;

    if (items.length < 3) {
      return NextResponse.json({ error: "Add more items to your wardrobe first" }, { status: 400 });
    }

    // Get weather for destination
    let weatherInfo = "Weather data unavailable.";
    try {
      const start = new Date(startDate);
      const now = new Date();
      const daysUntilTrip = Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilTrip <= 10 && daysUntilTrip >= 0) {
        // Use forecast for trips within 10 days
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
        // Use historical averages for trips further out
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

    const prompt = `You are Yav, an expert personal stylist and travel packing advisor. Create a smart packing list from the user's wardrobe for their trip.

WARDROBE:
${wardrobeList}

TRIP DETAILS:
- Destination: ${destination}
- Dates: ${startDate} to ${endDate} (${tripDays} days)
- Weather: ${weatherInfo}
- Planned occasions: ${occasions || "General travel"}
${notes ? `- Notes: ${notes}` : ""}

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

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to generate packing list" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Resolve items
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
