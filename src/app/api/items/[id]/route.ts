import { NextRequest, NextResponse } from "next/server";
import { readData, writeData } from "@/lib/server-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await readData();
  const item = data.items.find((i) => i.id === id);

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const updates = await request.json();
  const data = await readData();

  const index = data.items.findIndex((i) => i.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  data.items[index] = { ...data.items[index], ...updates };
  await writeData(data);

  return NextResponse.json(data.items[index]);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await readData();

  data.items = data.items.filter((i) => i.id !== id);
  await writeData(data);

  return NextResponse.json({ ok: true });
}
