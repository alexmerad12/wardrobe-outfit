import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

// Mirrors the column defaults in supabase-schema.sql so a user with no
// row yet (signed up, hasn't finished onboarding) still gets a usable
// prefs object instead of `null` — consumers shouldn't need null guards.
const DEFAULT_PREFERENCES = {
  location: null,
  temperature_sensitivity: "normal",
  temperature_unit: "auto",
  language: "auto",
  gender: "not-specified",
  preferred_styles: [] as string[],
  favorite_colors: [] as string[],
  avoided_colors: [] as string[],
  use_device_location: true,
};

// Columns a client is allowed to write. Anything else (user_id, unknown
// keys that would 500 as "column not found") is dropped before upsert.
const WRITABLE_KEYS = Object.keys(DEFAULT_PREFERENCES);

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? { ...DEFAULT_PREFERENCES, user_id: userId });
}

export async function PUT(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => WRITABLE_KEYS.includes(key))
  );

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ ...updates, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
