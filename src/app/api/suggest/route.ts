import { NextRequest, NextResponse } from "next/server";
import { readData } from "@/lib/server-storage";
import type { ClothingItem, Mood, Occasion, WeatherData } from "@/lib/types";
import { getWeather, getSeasonFromMonth } from "@/lib/weather";
import {
  filterItemsByContext,
  generateOutfitCandidates,
  MOOD_COLOR_PREFERENCES,
} from "@/lib/outfit-engine";

export async function POST(request: NextRequest) {
  try {
    const { mood, occasion } = (await request.json()) as {
      mood: Mood;
      occasion: Occasion;
    };

    const data = await readData();
    const items = data.items;

    if (items.length < 3) {
      return NextResponse.json({
        suggestions: [],
        message: "Add at least 3 items to get outfit suggestions",
      });
    }

    // Get weather data
    let weather: WeatherData | null = null;
    try {
      const location = data.preferences?.location;
      if (location?.lat && location?.lng) {
        weather = await getWeather(location.lat, location.lng);
      } else {
        weather = await getWeather(48.8566, 2.3522);
      }
    } catch {
      // Weather fetch failed, proceed without it
    }

    const currentSeason = getSeasonFromMonth(new Date().getMonth() + 1);

    const context = {
      weather,
      mood,
      occasion,
      season: currentSeason,
    };

    const filteredItems = filterItemsByContext(items as ClothingItem[], context);
    const candidates = generateOutfitCandidates(filteredItems, context, 3);

    const suggestions = candidates.map((candidate) => ({
      ...candidate,
      reasoning: generateBasicReasoning(candidate, mood, occasion, weather),
    }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

function generateBasicReasoning(
  candidate: ReturnType<typeof generateOutfitCandidates>[0],
  mood: Mood,
  occasion: Occasion,
  weather: WeatherData | null
): string {
  const parts: string[] = [];

  if (candidate.color_harmony !== "none" && candidate.color_harmony !== "too-many-colors") {
    parts.push(
      `This outfit uses a ${candidate.color_harmony} color scheme for a cohesive look.`
    );
  }

  if (weather) {
    if (weather.temp < 10) {
      parts.push("Layered up for the cold weather.");
    } else if (weather.temp > 25) {
      parts.push("Light and breathable for the warm day.");
    }
  }

  const moodComments: Record<Mood, string> = {
    energized: "Bright picks to match your energy!",
    confident: "Sharp and polished to own the day.",
    playful: "Fun mix to express your creative side.",
    cozy: "Soft and comfy for a cozy vibe.",
    chill: "Relaxed and easy — no effort needed.",
    bold: "A statement look that turns heads.",
    period: "Maximum comfort without sacrificing style.",
    sad: "Something gentle to lift your spirits.",
  };

  parts.push(moodComments[mood]);

  return parts.join(" ");
}
