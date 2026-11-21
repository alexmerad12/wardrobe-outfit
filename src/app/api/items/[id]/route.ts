import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { dbErrorResponse } from "@/lib/db-error";
import { photosLeftBehind } from "@/lib/item-photos";
import { removeUnusedPhotos } from "@/lib/remove-photos";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;
  const { id } = await params;

  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return dbErrorResponse(error);
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;
  const { id } = await params;

  const updates = await readJsonObject(request);
  if (isNextResponse(updates)) return updates;
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;

  // A new photo replaces the file the piece showed: read which one that is,
  // so it can be removed once the update went through ("Change photo" left
  // the old file in storage for good until 2026-11-21).
  const touchesPhoto = "image_url" in updates || "thumbnail_url" in updates;
  const before = touchesPhoto
    ? (
        await supabase
          .from("clothing_items")
          .select("image_url, thumbnail_url")
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;

  const { data, error } = await supabase
    .from("clothing_items")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return dbErrorResponse(error);
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (touchesPhoto) {
    await removeUnusedPhotos(supabase, userId, photosLeftBehind(userId, before, data));
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;
  const { id } = await params;

  // Read the image URLs BEFORE deleting the row: deleting an item used to
  // leave its photo in the clothing-images bucket forever (audit P2: every
  // delete orphaned a storage object).
  const { data: row } = await supabase
    .from("clothing_items")
    .select("image_url, thumbnail_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("clothing_items")
    .delete()
    .eq("id", id);

  if (error) {
    return dbErrorResponse(error);
  }

  // Best effort, after the delete the user asked for: the piece's own
  // files, unless another of their pieces still points at one of them.
  await removeUnusedPhotos(supabase, userId, photosLeftBehind(userId, row, null));

  return NextResponse.json({ ok: true });
}
