import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await readData();
  if (!data.trips) data.trips = [];
  data.trips = data.trips.filter((t) => t.id !== id);
  await writeData(data);
  return NextResponse.json({ ok: true });
}
