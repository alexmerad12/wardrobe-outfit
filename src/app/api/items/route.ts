import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("clothing_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const body = await request.json();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Lifetime upload counter — visibility only, no enforcement. No TTL,
  // so we can read it later to see distribution before locking launch
  // tier limits. Fire-and-forget — telemetry must not block insert.
  kv.incr(`items_uploaded:${userId}`).catch(() => {});

  return NextResponse.json(data, { status: 201 });
}
