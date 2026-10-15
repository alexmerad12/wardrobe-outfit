import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { dbErrorResponse } from "@/lib/db-error";

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    return dbErrorResponse(error);
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const body = await readJsonObject(request);
  if (isNextResponse(body)) return body;
  delete body.id;
  delete body.user_id;
  delete body.created_at;

  const { data, error } = await supabase
    .from("trips")
    .insert({ ...body, user_id: userId })
    .select()
    .single();

  if (error) {
    return dbErrorResponse(error);
  }
  return NextResponse.json(data, { status: 201 });
}
