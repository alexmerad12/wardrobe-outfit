import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";
import type { UserPreferences } from "@/lib/types";

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.preferences);
}

export async function PUT(request: NextRequest) {
  try {
    const prefs = (await request.json()) as UserPreferences;
    const data = await readData();
    data.preferences = prefs;
    await writeData(data);

    return NextResponse.json(prefs);
  } catch (error) {
    console.error("Failed to save preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
