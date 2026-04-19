import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

const RECENT_CAP = 14;

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const today = new Date().toISOString().split("T")[0];

  // Fetch today row and the recent list in parallel
  const [todayRes, recentRes] = await Promise.all([
    supabase
      .from("today_outfit")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("recent_outfits")
      .select("*")
      .order("date", { ascending: false })
      .limit(RECENT_CAP),
  ]);

  if (todayRes.error) {
    return NextResponse.json({ error: todayRes.error.message }, { status: 500 });
  }
  if (recentRes.error) {
    return NextResponse.json(
      { error: recentRes.error.message },
      { status: 500 }
    );
  }

  let todayOutfit = todayRes.data;
  let recent = recentRes.data ?? [];

  // Rotate stale today_outfit → recent_outfits
  if (todayOutfit && todayOutfit.date !== today) {
    await supabase.from("recent_outfits").insert({
      user_id: userId,
      outfit_id: todayOutfit.outfit_id,
      item_ids: todayOutfit.item_ids,
      name: todayOutfit.name,
      reasoning: todayOutfit.reasoning,
      mood: todayOutfit.mood,
      occasion: todayOutfit.occasion,
      weather_temp: todayOutfit.weather_temp,
      weather_condition: todayOutfit.weather_condition,
      is_favorite: todayOutfit.is_favorite,
      date: todayOutfit.date,
    });
    await supabase.from("today_outfit").delete().eq("user_id", userId);

    // Trim recent to last 14
    const { data: extras } = await supabase
      .from("recent_outfits")
      .select("id")
      .order("date", { ascending: false })
      .range(RECENT_CAP, 9999);
    if (extras && extras.length > 0) {
      await supabase
        .from("recent_outfits")
        .delete()
        .in(
          "id",
          extras.map((r) => r.id)
        );
    }

    todayOutfit = null;
    const { data: refreshed } = await supabase
      .from("recent_outfits")
      .select("*")
      .order("date", { ascending: false })
      .limit(RECENT_CAP);
    recent = refreshed ?? [];
  }

  return NextResponse.json({ today: todayOutfit, recent });
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const body = await request.json();
  const today = new Date().toISOString().split("T")[0];

  const row = {
    user_id: userId,
    outfit_id: body.outfit_id ?? crypto.randomUUID(),
    item_ids: body.item_ids ?? [],
    name: body.name ?? null,
    reasoning: body.reasoning ?? null,
    mood: body.mood ?? null,
    occasion: body.occasion ?? null,
    weather_temp: body.weather_temp ?? null,
    weather_condition: body.weather_condition ?? null,
    is_favorite: body.is_favorite ?? true,
    date: today,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("today_outfit")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const updates = await request.json();
  delete updates.user_id;

  const { data, error } = await supabase
    .from("today_outfit")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No today outfit" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const { data: current } = await supabase
    .from("today_outfit")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (current) {
    await supabase.from("recent_outfits").insert({
      user_id: userId,
      outfit_id: current.outfit_id,
      item_ids: current.item_ids,
      name: current.name,
      reasoning: current.reasoning,
      mood: current.mood,
      occasion: current.occasion,
      weather_temp: current.weather_temp,
      weather_condition: current.weather_condition,
      is_favorite: current.is_favorite,
      date: current.date,
    });
    await supabase.from("today_outfit").delete().eq("user_id", userId);

    const { data: extras } = await supabase
      .from("recent_outfits")
      .select("id")
      .order("date", { ascending: false })
      .range(RECENT_CAP, 9999);
    if (extras && extras.length > 0) {
      await supabase
        .from("recent_outfits")
        .delete()
        .in(
          "id",
          extras.map((r) => r.id)
        );
    }
  }

  return NextResponse.json({ ok: true });
}
