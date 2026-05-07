import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

export async function GET() {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("outfits")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

type SwapPair = {
  original_item_id: string;
  replacement_item_id: string;
  occasion?: string | null;
  mood?: string | null;
  weather_temp?: number | null;
  weather_condition?: string | null;
  season?: string | null;
  saved_via: "favorite" | "wear_today";
};

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const body = await request.json();
  delete body.id;
  delete body.user_id;
  delete body.created_at;

  // swap_pairs is the optional client-supplied list of edits the user
  // made to the AI's suggestion before saving. Strip from the outfit
  // body before insert — this field doesn't belong on the outfits row,
  // it gets logged separately to outfit_edits as feedback signal.
  const swapPairs: SwapPair[] = Array.isArray(body.swap_pairs) ? body.swap_pairs : [];
  delete body.swap_pairs;

  const { data, error } = await supabase
    .from("outfits")
    .insert({ ...body, user_id: userId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire-and-forget swap logging — outfit save MUST NOT fail if the
  // edits log insert errors. RLS on outfit_edits requires user_id
  // matches auth.uid(), so we explicitly set it from the auth context.
  if (swapPairs.length > 0) {
    supabase
      .from("outfit_edits")
      .insert(
        swapPairs.map((p) => ({
          user_id: userId,
          outfit_id: data.id,
          original_item_id: p.original_item_id,
          replacement_item_id: p.replacement_item_id,
          occasion: p.occasion ?? null,
          mood: p.mood ?? null,
          weather_temp: p.weather_temp ?? null,
          weather_condition: p.weather_condition ?? null,
          season: p.season ?? null,
          saved_via: p.saved_via,
        }))
      )
      .then(({ error: editsErr }) => {
        if (editsErr) {
          console.warn("[outfit_edits] insert failed:", editsErr.message);
        }
      });
  }

  return NextResponse.json(data, { status: 201 });
}
