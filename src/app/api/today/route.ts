import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";

export async function GET() {
  const data = await readData();

  // Auto-clear if it's a different day
  const today = new Date().toISOString().split("T")[0];
  if (data.today_outfit && data.today_outfit.date !== today) {
    // Move yesterday's outfit to recent history
    if (!data.recent_outfits) data.recent_outfits = [];
    data.recent_outfits.unshift(data.today_outfit);
    // Keep last 14 days
    data.recent_outfits = data.recent_outfits.slice(0, 14);
    data.today_outfit = null;
    await writeData(data);
  }

  return NextResponse.json({
    today: data.today_outfit,
    recent: data.recent_outfits ?? [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await readData();

    const today = new Date().toISOString().split("T")[0];

    // If there's already a today outfit, move it to recent
    if (data.today_outfit && data.today_outfit.date === today) {
      if (!data.recent_outfits) data.recent_outfits = [];
    }

    data.today_outfit = {
      outfit_id: body.outfit_id || crypto.randomUUID(),
      item_ids: body.item_ids,
      name: body.name || null,
      reasoning: body.reasoning || null,
      mood: body.mood || null,
      occasion: body.occasion || null,
      weather_temp: body.weather_temp ?? null,
      weather_condition: body.weather_condition || null,
      is_favorite: body.is_favorite ?? true,
      date: today,
    };

    await writeData(data);

    return NextResponse.json(data.today_outfit);
  } catch (error) {
    console.error("Failed to set today's outfit:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const updates = await request.json();
    const data = await readData();

    if (!data.today_outfit) {
      return NextResponse.json({ error: "No today outfit" }, { status: 404 });
    }

    data.today_outfit = { ...data.today_outfit, ...updates };
    await writeData(data);

    return NextResponse.json(data.today_outfit);
  } catch (error) {
    console.error("Failed to update today's outfit:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const data = await readData();
    if (data.today_outfit) {
      if (!data.recent_outfits) data.recent_outfits = [];
      data.recent_outfits.unshift(data.today_outfit);
      data.recent_outfits = data.recent_outfits.slice(0, 14);
      data.today_outfit = null;
      await writeData(data);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to clear today's outfit:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
