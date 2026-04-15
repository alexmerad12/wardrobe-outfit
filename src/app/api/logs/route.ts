import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";
import type { OutfitLog } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  const data = await readData();
  let logs = data.logs;

  if (startDate && endDate) {
    logs = logs.filter(
      (l) => l.worn_date >= startDate && l.worn_date <= endDate
    );
  }

  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Omit<OutfitLog, "id">;
    const data = await readData();

    const newLog: OutfitLog = {
      ...body,
      id: crypto.randomUUID(),
    };

    data.logs.push(newLog);
    await writeData(data);

    return NextResponse.json(newLog, { status: 201 });
  } catch (error) {
    console.error("Failed to create log:", error);
    return NextResponse.json({ error: "Failed to create log" }, { status: 500 });
  }
}
