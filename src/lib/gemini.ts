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
// GEMINI_QUALITY_MODEL overrides it without a deploy (an outage on this
// model, its free-tier day cap, or to run the outfit tier on Flash-Lite).
// Any Flash or Flash-Lite id works: the thinking settings below follow it.
// gemini-3.5-flash-lite as the outfit model, tested 2026-10-16: rule
// harness 8/8, endpoint sweep 61/61, natural French. But on the same
// wardrobe and request as 3.6 it skipped the prompt's soft "statement
// piece" instruction (3.6 added the red scarf), so 3.6 stays the default.
// Flash-Lite is the fallback: ~2.5x cheaper input, 1.5x cheaper output,
// and it still answers on the free tier when the Flash models are capped.
export const QUALITY_MODEL = process.env.GEMINI_QUALITY_MODEL || "gemini-3.6-flash";

// Fast tier: photo classification and packing lists, protected by the
// enum sanitizers (analyze, try-on item read, packing).
// gemini-3.5-flash-lite: $0.30 / $2.50 per 1M, ~5 s per photo against
// 16-33 s for the retired gemini-3-flash-preview, with the same accuracy
// on real wardrobe photos (category / pattern / warmth 100 %).
export const FAST_MODEL = "gemini-3.5-flash-lite";

// Flash-Lite REJECTS thinkingBudget (HTTP 400); it takes thinkingLevel.
// MINIMAL is its cheapest level (may still think a little, so leave
// maxOutputTokens headroom: thinking tokens count against it).
export const FAST_THINKING: ThinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };

// Quality-tier thinking. Budgets are what the suggest rule harness was
// tuned on; 3.6-flash accepts them (verified 2026-10-15). When the quality
// tier runs on a Flash-Lite model (GEMINI_QUALITY_MODEL), the same intent
// maps to thinkingLevel: MINIMAL for "no thinking", MEDIUM for suggest.
// LOW thinks zero tokens and put jeans in an office outfit in a probe;
// MEDIUM (~660 thinking tokens there) followed the rules.
const QUALITY_IS_LITE = /flash-lite/.test(QUALITY_MODEL);
export const NO_THINKING: ThinkingConfig = QUALITY_IS_LITE
  ? { thinkingLevel: ThinkingLevel.MINIMAL }
  : { thinkingBudget: 0 };
export const SUGGEST_THINKING: ThinkingConfig = QUALITY_IS_LITE
  ? { thinkingLevel: ThinkingLevel.MEDIUM }
  : { thinkingBudget: 3072 };
