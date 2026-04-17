import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";
import type { SavedTrip } from "@/lib/server-storage";

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.trips ?? []);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await readData();
    if (!data.trips) data.trips = [];

    const trip: SavedTrip = {
      id: crypto.randomUUID(),
      destination: body.destination,
      lat: body.lat,
      lng: body.lng,
      start_date: body.start_date,
      end_date: body.end_date,
      occasions: body.occasions || "",
      notes: body.notes || "",
      packing_item_ids: body.packing_item_ids ?? [],
      weather_summary: body.weather_summary ?? null,
      packing_tips: body.packing_tips ?? null,
      outfit_suggestions: body.outfit_suggestions ?? [],
      created_at: new Date().toISOString(),
    };

    data.trips.unshift(trip);
    await writeData(data);

    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    console.error("Failed to save trip:", error);
    return NextResponse.json({ error: "Failed to save trip" }, { status: 500 });
  }
}
