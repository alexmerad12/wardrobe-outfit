import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { kv } from "@vercel/kv";
import type { ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";

// Refine endpoint — re-writes reasoning + styling_tip for an outfit
// the user has edited (swapped items) before they save it. Cheaper
// than a full /api/suggest call: no thinking budget, no 3-outfit
// generation, just one editorial sentence + one styling tip for the
// new combination.
//
// Used only on save (favorites + wear today) when the user has
// actually swapped at least one item. Scoped tighter to keep cost
// trivial — at ~$0.01/call this stays well within the Basic tier
// economics even if the user swaps every save.
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

// Daily cap is generous — refine is gated by save behaviour (user
// commits to keeping the outfit), so abuse vector is minimal. 30/day
// is well above any realistic save pattern.
const REFINE_DAILY_CAP = 30;

function describeItemForPrompt(item: ClothingItem): string {
  const parts: string[] = [item.name];
  parts.push(`(${item.category}${item.subcategory ? "/" + item.subcategory : ""})`);
  const colors = item.colors.map((c) => c.name).join(", ");
  if (colors) parts.push(`Colors: ${colors}`);
  if (item.fit) parts.push(`Fit: ${item.fit}`);
  const mats = Array.isArray(item.material) ? item.material : [item.material];
  if (mats.length) parts.push(`Material: ${mats.join(", ")}`);
  if (item.warmth_rating) parts.push(`Warmth: ${item.warmth_rating}/5`);
  return parts.join(" | ");
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  // Daily-cap gate. Same KV-counter pattern as /api/suggest. Admin +
  // CAP_BYPASS_EMAILS bypass enforcement; counter still increments.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const isAdmin = isCapBypassed(authUser?.email);
  const today = new Date().toISOString().slice(0, 10);
  const countKey = `refine_count:${userId}:${today}`;
  const newCount = await kv.incr(countKey).catch(() => -1);
  if (newCount === 1) {
    kv.expire(countKey, 60 * 60 * 36).catch(() => {});
  }
  if (!isAdmin && newCount > REFINE_DAILY_CAP) {
    return NextResponse.json(
      { error: "daily_limit_reached", limit: REFINE_DAILY_CAP, used: newCount },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      item_ids: string[];
      occasion: Occasion | null;
      mood: Mood | null;
      weather_temp: number | null;
      weather_condition: string | null;
      locale?: "en" | "fr";
    };

    const { item_ids, occasion, mood, weather_temp, weather_condition } = body;
    const locale = body.locale ?? "en";
    const languageName = locale === "fr" ? "French" : "English";

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return NextResponse.json({ error: "item_ids required" }, { status: 400 });
    }

    // Hydrate items from Supabase. RLS scopes to the current user — if
    // any item_id isn't owned by them, we just won't find it and it
    // gets dropped from the prompt. Failing to find ANY items returns
    // a graceful error rather than crashing.
    const { data: items, error: itemsErr } = await supabase
      .from("clothing_items")
      .select("*")
      .in("id", item_ids);

    if (itemsErr || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Could not load items" },
        { status: 502 }
      );
    }

    const moodInfo = mood ? MOOD_CONFIG[mood] : null;
    const occasionLabel = occasion ? OCCASION_LABELS[occasion] : "casual";
    const weatherLine =
      weather_temp != null
        ? `${weather_temp}°C${weather_condition ? `, ${weather_condition}` : ""}`
        : "Unknown";

    const itemsList = (items as ClothingItem[]).map(describeItemForPrompt).join("\n");

    const prompt = `You are Yav, a sharp personal stylist with a strong point of view. The user has edited an outfit (swapped one or more items from your earlier suggestion). Re-write the reasoning and styling tip for THIS specific combination.

VOICE: speak DIRECTLY to the wearer in second person — "you" in English, "tu" in French. NEVER write "the user", "the wearer", "she", "he", "they", or any third-person reference.

OUTFIT (final, after user's edits):
${itemsList}

CONTEXT:
- Occasion: ${occasionLabel}
- Mood: ${moodInfo ? `${moodInfo.label} — ${moodInfo.description}` : "Unspecified"}
- Weather: ${weatherLine}

Write in ${languageName}. Both fields are short editorial sentences — no filler like "perfect for" or "this outfit works because".

Respond with ONLY:
- reasoning: ONE editorial sentence citing one specific styling principle at play (color harmony, silhouette balance, texture play, or occasion fit). Refer to pieces by broad category only (the dress, the bottoms, the jacket).
- styling_tip: ONE short sentence with a concrete styling action applied to items in this outfit (tuck, half-tuck, cuff, roll sleeves, layer open, cinch, knot hem). Or null if nothing useful fits.`;

    const result = await withGeminiRetry(
      () =>
        genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            temperature: 0.7,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reasoning: { type: Type.STRING },
                styling_tip: { type: Type.STRING, nullable: true },
              },
              required: ["reasoning"],
            },
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      { tag: "suggest/refine" }
    );

    const text = result.text ?? "";
    let parsed: { reasoning?: string; styling_tip?: string | null };
    try {
      parsed = JSON.parse(text);
    } catch {
      // If parse fails, log + return the raw text as reasoning so the
      // client gets SOMETHING usable rather than an error. Save flow
      // already graceful-degrades on errors but a usable string is
      // better than nothing.
      logAiCall(supabase, userId, "suggest", { succeeded: false });
      return NextResponse.json(
        { error: "Failed to parse refine response" },
        { status: 502 }
      );
    }

    logAiCall(supabase, userId, "suggest", {
      metadata: { kind: "refine", item_count: items.length },
    });

    return NextResponse.json({
      reasoning: parsed.reasoning ?? null,
      styling_tip: parsed.styling_tip ?? null,
    });
  } catch (err) {
    console.error("[refine] error:", err);
    logAiCall(supabase, userId, "suggest", { succeeded: false });
    return NextResponse.json(
      { error: "Refine failed" },
      { status: 500 }
    );
  }
}
