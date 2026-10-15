import { NextRequest, NextResponse, after } from "next/server";
import { kv } from "@/lib/kv";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { dbErrorResponse } from "@/lib/db-error";

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .order("created_at", { ascending: false });

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
  // Strip client-provided fields that the server owns
  delete body.id;
  delete body.user_id;
  delete body.created_at;
  delete body.times_worn;
  delete body.last_worn_date;

  const { data, error } = await supabase
    .from("clothing_items")
    .insert({ ...body, user_id: userId, times_worn: 0, last_worn_date: null })
    .select()
    .single();

  if (error) {
    return dbErrorResponse(error);
  }

  // Lifetime upload counter — visibility only, no enforcement. No TTL,
  // so we can read it later to see distribution before locking launch
  // tier limits. Fire-and-forget — telemetry must not block insert.
  after(() => kv().incr(`items_uploaded:${userId}`).catch(() => {}));

  return NextResponse.json(data, { status: 201 });
}
