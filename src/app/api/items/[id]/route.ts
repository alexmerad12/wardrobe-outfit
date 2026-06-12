import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  const { supabase } = ctx;
  const { id } = await params;

  const updates = await request.json();
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;

  const { data, error } = await supabase
    .from("clothing_items")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

// Extract the bucket-relative path from a public clothing-images URL
// (strips the ?v= cache-buster the normalize endpoint appends).
function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/object\/public\/clothing-images\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;
  const { id } = await params;

  // Read the image URLs BEFORE deleting the row — deleting an item
  // used to leave its photo in the clothing-images bucket forever
  // (audit P2: every delete orphaned a storage object).
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort storage cleanup — a failure here must not undo the
  // delete the user asked for. Storage RLS scopes removal to the
  // user's own folder.
  const paths = [
    storagePathFromUrl(row?.image_url),
    storagePathFromUrl(row?.thumbnail_url),
  ].filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("clothing-images")
      .remove(paths);
    if (storageError) {
      console.warn("[items] storage cleanup failed:", storageError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
