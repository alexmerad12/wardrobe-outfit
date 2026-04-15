import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";
import type { Outfit } from "@/lib/types";

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.outfits);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Omit<Outfit, "id" | "created_at">;
    const data = await readData();

    const newOutfit: Outfit = {
      ...body,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    data.outfits.unshift(newOutfit);
    await writeData(data);

    return NextResponse.json(newOutfit, { status: 201 });
  } catch (error) {
    console.error("Failed to create outfit:", error);
    return NextResponse.json({ error: "Failed to create outfit" }, { status: 500 });
  }
}
