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
// model, or its free-tier day cap while testing locally). The override
// must accept thinkingBudget, like gemini-2.5-flash does. Leave it unset
// in production.
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
// tuned on; 3.6-flash accepts them (verified 2026-10-15).
export const NO_THINKING: ThinkingConfig = { thinkingBudget: 0 };
export const SUGGEST_THINKING: ThinkingConfig = { thinkingBudget: 3072 };
