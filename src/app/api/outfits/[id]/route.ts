import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();
  const data = await readData();

  const index = data.outfits.findIndex((o) => o.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Outfit not found" }, { status: 404 });
  }

  data.outfits[index] = { ...data.outfits[index], ...updates };
  await writeData(data);

  return NextResponse.json(data.outfits[index]);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await readData();

  data.outfits = data.outfits.filter((o) => o.id !== id);
  await writeData(data);

  return NextResponse.json({ ok: true });
}
