import type { SupabaseClient } from "@supabase/supabase-js";

export type AiFeature = "suggest" | "try_on" | "packing" | "analyze_item";

// Per-call cost estimates in cents. Static lookups, not actual billed
// cost — close enough for trend lines and tier-pricing decisions. The
// real numbers live in the Google AI Studio dashboard.
const COST_CENTS: Record<AiFeature, number> = {
  suggest: 2.9,
  try_on: 1.5,
  packing: 1.0,
  analyze_item: 0.8,
};

export function logAiCall(
  supabase: SupabaseClient,
  userId: string,
  feature: AiFeature,
  opts: { succeeded?: boolean; metadata?: Record<string, unknown> } = {}
): void {
  // Fire and forget. Telemetry must never block the user's response —
  // a Supabase blip should not turn a successful AI call into an error.
  supabase
    .from("ai_calls")
    .insert({
      user_id: userId,
      feature,
      cost_estimate_cents: COST_CENTS[feature],
      succeeded: opts.succeeded ?? true,
      metadata: opts.metadata ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[ai_calls] log failed:", error.message);
    });
}
