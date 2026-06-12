import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

export type AiFeature = "suggest" | "refine" | "try_on" | "packing" | "analyze_item";

// Per-call cost estimates in cents. Static lookups, not actual billed
// cost — close enough for trend lines and tier-pricing decisions. The
// real numbers live in the Google AI Studio dashboard.
const COST_CENTS: Record<AiFeature, number> = {
  suggest: 2.9,
  refine: 0.5,
  try_on: 1.5,
  packing: 1.0,
  analyze_item: 0.8,
};

// supabase-migration-ai-call-refine.sql was applied 2026-06-13, so
// refine rows are filed under their own feature label. Historical
// refine rows (before the migration) sit under feature='suggest' with
// metadata->>'kind' = 'refine'.
const DB_FEATURE: Record<AiFeature, string> = {
  suggest: "suggest",
  refine: "refine",
  try_on: "try_on",
  packing: "packing",
  analyze_item: "analyze_item",
};

export function logAiCall(
  supabase: SupabaseClient,
  userId: string,
  feature: AiFeature,
  opts: { succeeded?: boolean; metadata?: Record<string, unknown> } = {}
): void {
  // Telemetry must never block the user's response, but plain
  // fire-and-forget raced the serverless freeze — the function could
  // be suspended right after the response, silently dropping the
  // insert. after() keeps the platform alive until the write settles.
  after(async () => {
    const { error } = await supabase.from("ai_calls").insert({
      user_id: userId,
      feature: DB_FEATURE[feature],
      cost_estimate_cents: COST_CENTS[feature],
      succeeded: opts.succeeded ?? true,
      metadata: opts.metadata ?? null,
    });
    if (error) console.warn("[ai_calls] log failed:", error.message);
  });
}
