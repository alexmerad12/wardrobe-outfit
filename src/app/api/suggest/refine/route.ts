import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { Type } from "@google/genai";
import type { ClothingItem, Mood, Occasion } from "@/lib/types";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { requireActiveSubscription } from "@/lib/require-subscription";
import { withModelFallback, withParseRetry } from "@/lib/gemini-retry";
import { genAI, QUALITY_MODELS, thinkingFor } from "@/lib/gemini";
import { logAiCall } from "@/lib/log-ai-call";
import { isCapBypassed } from "@/lib/admin-bypass";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";
import { oneSentence, textIsConsistent } from "@/lib/suggest-text-guards";

// Refine endpoint — re-writes reasoning + styling_tip for an outfit
// the user has edited (swapped items) before they save it. Cheaper
// than a full /api/suggest call: no thinking budget, no 3-outfit
// generation, just one editorial sentence + one styling tip for the
// new combination. Quality tier model (src/lib/gemini.ts).
//
// Used only on save (favorites + wear today) when the user has
// actually swapped at least one item.

// Refine is cheap per call (~$0.005, no thinking, short output) — kept
// at 10/day so caps read consistently across endpoints. Tier presets:
//   - Conservative: 5/day
//   - Balanced:    10/day  ← current beta cap
//   - Generous:    15/day  ← future Atelier tier
const REFINE_DAILY_CAP = 10;

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

type RefineBody = {
  item_ids?: unknown;
  occasion?: unknown;
  mood?: unknown;
  weather_temp?: unknown;
  weather_condition?: unknown;
  locale?: unknown;
};

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  const subBlock = await requireActiveSubscription(ctx);
  if (subBlock) return subBlock;

  const body = (await request.json().catch(() => null)) as RefineBody | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const item_ids = Array.isArray(body.item_ids)
    ? body.item_ids.filter((id): id is string => typeof id === "string").slice(0, 12)
    : [];
  if (item_ids.length === 0) {
    return NextResponse.json({ error: "item_ids required" }, { status: 400 });
  }
  // Unknown values are dropped rather than written into the prompt as
  // "undefined" (audit P2).
  const occasion =
    typeof body.occasion === "string" && body.occasion in OCCASION_LABELS
      ? (body.occasion as Occasion)
      : null;
  const mood =
    typeof body.mood === "string" && body.mood in MOOD_CONFIG ? (body.mood as Mood) : null;
  const weather_temp = typeof body.weather_temp === "number" ? body.weather_temp : null;
  const weather_condition =
    typeof body.weather_condition === "string" ? body.weather_condition.slice(0, 60) : null;
  const locale: "en" | "fr" = body.locale === "fr" ? "fr" : "en";
  const languageName = locale === "fr" ? "French" : "English";

  // Hydrate items from Supabase. RLS scopes to the current user — if
  // any item_id isn't owned by them, we just won't find it and it
  // gets dropped from the prompt.
  const { data: items, error: itemsErr } = await supabase
    .from("clothing_items")
    .select("*")
    .in("id", item_ids);
  if (itemsErr || !items || items.length === 0) {
    return NextResponse.json({ error: "Could not load items" }, { status: 502 });
  }

  // Daily-cap gate: consumed after the free validation exits, refunded
  // when the request delivers nothing.
  const isAdmin = isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed);
  const countKey = `refine_count:${userId}:${localDayKey(request)}`;
  const capCount = await consumeDailyCap(countKey);
  if (!isAdmin && capCount > REFINE_DAILY_CAP) {
    return NextResponse.json(
      {
        error: "daily_limit_reached",
        limit: REFINE_DAILY_CAP,
        used: Math.min(capCount, REFINE_DAILY_CAP),
      },
      { status: 429 }
    );
  }
  const refund = () => {
    if (capCount !== -1) refundDailyCap(countKey);
  };

  try {
    const moodInfo = mood ? MOOD_CONFIG[mood] : null;
    const occasionLabel = occasion ? OCCASION_LABELS[occasion] : "casual";
    const weatherLine =
      weather_temp != null
        ? `${weather_temp}°C${weather_condition ? `, ${weather_condition}` : ""}`
        : "Unknown";

    const itemsList = (items as ClothingItem[]).map(describeItemForPrompt).join("\n");

    const prompt = `You are Linette, a sharp personal stylist with a strong point of view. The user has edited an outfit (swapped one or more items from your earlier suggestion). Re-write the reasoning and styling tip for THIS specific combination.

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

    // An unparseable answer is asked again once (withParseRetry).
    const {
      answer: { model },
      parsed,
    } = await withParseRetry(
      () =>
        withModelFallback(
          QUALITY_MODELS,
          (m) =>
            genAI.models.generateContent({
              model: m,
              contents: prompt,
              config: {
                maxOutputTokens: 1024,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    reasoning: { type: Type.STRING },
                    styling_tip: { type: Type.STRING, nullable: true },
                  },
                  required: ["reasoning"],
                },
                thinkingConfig: thinkingFor(m, "none"),
              },
            }),
          { tag: "suggest/refine" }
        ),
      ({ result }) => JSON.parse(result.text ?? "") as { reasoning?: string; styling_tip?: string | null },
      { tag: "suggest/refine" }
    );
    if (!parsed) {
      refund();
      logAiCall(supabase, userId, "refine", { succeeded: false, metadata: { model } });
      return NextResponse.json({ error: "Failed to parse refine response" }, { status: 502 });
    }

    // Same guards as /api/suggest's prose path: one sentence max, no
    // hallucinated garment references, no garbled French. Refine output
    // gets PERSISTED on the saved outfit, so a bad string here is worse
    // than in suggest — null lets the client keep the previous text.
    const rawReasoning = oneSentence(parsed.reasoning);
    const rawTip = oneSentence(parsed.styling_tip);
    const cleanItems = items as ClothingItem[];
    const reasoning =
      rawReasoning && textIsConsistent(cleanItems, rawReasoning, locale) ? rawReasoning : null;
    const styling_tip =
      rawTip && textIsConsistent(cleanItems, rawTip, locale) ? rawTip : null;

    logAiCall(supabase, userId, "refine", {
      metadata: {
        kind: "refine",
        model,
        item_count: items.length,
        text_guard_rejected: {
          reasoning: !reasoning && !!parsed.reasoning,
          styling_tip: !styling_tip && !!parsed.styling_tip,
        },
      },
    });

    return NextResponse.json({ reasoning, styling_tip });
  } catch (err) {
    console.error("[refine] error:", err);
    Sentry.captureException(err);
    refund();
    logAiCall(supabase, userId, "refine", { succeeded: false, metadata: { models: QUALITY_MODELS } });
    return NextResponse.json({ error: "Refine failed" }, { status: 500 });
  }
}
