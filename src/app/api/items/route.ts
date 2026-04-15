import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";
import type { ClothingItem } from "@/lib/types";

export async function GET() {
  const data = await readData();
  return NextResponse.json(data.items);
}

export async function POST(request: NextRequest) {
  try {
    const item = (await request.json()) as Omit<ClothingItem, "id" | "created_at" | "times_worn" | "last_worn_date">;
    const data = await readData();

    const newItem: ClothingItem = {
      ...item,
      id: crypto.randomUUID(),
      times_worn: 0,
      last_worn_date: null,
      created_at: new Date().toISOString(),
    };

    data.items.unshift(newItem);
    await writeData(data);

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error("Failed to create item:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}
