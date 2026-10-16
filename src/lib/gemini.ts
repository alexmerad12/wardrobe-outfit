// Gemini client + model choices for every AI endpoint. Change models HERE,
// not in the routes. (Before 2026-10 each route hard-coded its own ID, and
// the `gemini-3.5-flash` alias was silently re-routed by Google to
// gemini-3.6-flash on 2026-10-08.)
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";

export const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? "" });

// Quality tier: outfit composition, where prompt drift breaks the UX
// (suggest, suggest/refine, try-on outfit simulation).
// gemini-3.6-flash, chosen 2026-10-15: answers reliably in 1-2 s, keeps
// French accents intact, accepts the thinkingBudget values the suggest
// rules were tuned with, and it is what production already ran through
// the alias. The newer gemini-3.8-flash (same price) returned only 503
// "high demand" / 429 for this project across 4 probe rounds: re-probe
// before switching. Price: $0.75 in / $3.75 out per 1M tokens through
// 2026-12-31, doubling on 2027-01-01 (both 3.6 and 3.8).
// GEMINI_QUALITY_MODEL overrides it without a deploy (to run the outfit
// tier on Flash-Lite, or on a newer Flash). Any Flash or Flash-Lite id
// works: thinkingFor() below follows it.
// gemini-3.5-flash-lite as the outfit model, tested 2026-10-16: rule
// harness 8/8, endpoint sweep 61/61, natural French. But on the same
// wardrobe and request as 3.6 it skipped the prompt's soft "statement
// piece" instruction (3.6 added the red scarf), so 3.6 stays the default
// and Flash-Lite is the fallback (QUALITY_MODELS).
export const QUALITY_MODEL = process.env.GEMINI_QUALITY_MODEL || "gemini-3.6-flash";

// Fast tier: photo classification and packing lists, protected by the
// enum sanitizers (analyze, try-on item read, packing).
// gemini-3.5-flash-lite: $0.30 / $2.50 per 1M, ~5 s per photo against
// 16-33 s for the retired gemini-3-flash-preview, with the same accuracy
// on real wardrobe photos (category / pattern / warmth 100 %).
export const FAST_MODEL = "gemini-3.5-flash-lite";

// The quality tier's models, in order, for withModelFallback(): when
// QUALITY_MODEL is overloaded (503 "high demand") or out of quota (429,
// the free tier's day cap included), the call moves to Flash-Lite, which
// has its own capacity and quota. The user gets an outfit instead of an
// error. On 2026-10-16 gemini-3.6-flash answered 503 to every call for
// minutes at a time, and before the fallback each of those was a failed
// suggest. ai_calls.metadata.model records which model answered.
export const QUALITY_MODELS: readonly string[] =
  QUALITY_MODEL === FAST_MODEL ? [QUALITY_MODEL] : [QUALITY_MODEL, FAST_MODEL];

// The fast tier's models, in order, for withModelFallback(): Flash-Lite,
// then the quality model when Flash-Lite is overloaded or out of quota.
// On 2026-10-16 Flash-Lite answered 503 to four tries in a row on half
// the photo tags of an endpoint sweep (the items kept blank tags). 3.6
// tags photos as well (category / pattern / formality / warmth 100 % on
// its sample, subcategory 80 % against 65 %) at ~$0.0045 a photo against
// $0.002, and only when Flash-Lite fails.
export const FAST_MODELS: readonly string[] =
  QUALITY_MODEL === FAST_MODEL ? [FAST_MODEL] : [FAST_MODEL, QUALITY_MODEL];

// Thinking settings for a call on `model` (every route takes them from
// here). Flash takes the budgets the suggest rule harness was tuned on
// (3.6-flash accepts them, verified 2026-10-15). Flash-Lite REJECTS
// thinkingBudget (HTTP 400) and maps the same intent to thinkingLevel:
// MINIMAL for "no thinking" (its cheapest level, which may still think a
// little, so leave maxOutputTokens headroom), MEDIUM for suggest. LOW
// thinks zero tokens and put jeans in an office outfit in a probe;
// MEDIUM (~660 thinking tokens there) followed the rules.
export function thinkingFor(model: string, kind: "suggest" | "none"): ThinkingConfig {
  const lite = /flash-lite/.test(model);
  if (kind === "suggest") {
    return lite ? { thinkingLevel: ThinkingLevel.MEDIUM } : { thinkingBudget: 3072 };
  }
  return lite ? { thinkingLevel: ThinkingLevel.MINIMAL } : { thinkingBudget: 0 };
}
