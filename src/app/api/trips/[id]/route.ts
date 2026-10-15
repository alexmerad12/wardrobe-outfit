import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { dbErrorResponse } from "@/lib/db-error";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;
  const { id } = await params;

  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) {
    return dbErrorResponse(error);
  }
  return NextResponse.json({ ok: true });
}
