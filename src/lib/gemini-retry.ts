// Shared retry wrapper for Gemini calls. Newly released models are
// capacity-flaky and routinely return:
//   - 503 UNAVAILABLE: "This model is currently experiencing high
//     demand. Spikes in demand are usually temporary."
//   - 429 RESOURCE_EXHAUSTED: rate-limit hit
// plus the occasional dropped connection (fetch failed / ECONNRESET /
// socket hang up). All transient: the next call usually succeeds, so a
// small exponential backoff is all we need. Without this, real users see
// 1-in-3 analyze calls fail in bulk and bulk items save as "Untitled item".
//
// NOT retried: a daily FREE-TIER quota 429 (quotaId ...PerDay...FreeTier).
// It won't clear for hours, and retrying only burns the user's wait.
// withModelFallback (below) sends that call, or one still failing on a
// 503 after its retries, to the next model in the list instead.

const RETRYABLE_PATTERN =
  /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|socket hang up|other side closed/i;
const NOT_RETRYABLE_PATTERN = /PerDay[A-Za-z]*-FreeTier/;

// Worth trying a different model: this one is overloaded (503
// UNAVAILABLE, 500 INTERNAL) or out of quota (429 RESOURCE_EXHAUSTED, the
// free tier's day cap included). Each model has its own capacity and
// quota. A 400 or a dropped connection would fail the same way on any
// model, so those are not.
const FALLBACK_PATTERN = /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL)\b/;

// The new @google/genai SDK throws ApiError with a JSON-stringified
// detail; older paths just throw plain Errors. Match against the
// serialised message.
function errorText(err: unknown): string {
  const cause = err instanceof Error && err.cause ? ` ${String((err.cause as Error).message ?? err.cause)}` : "";
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) + cause;
}

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const msg = errorText(err);
  if (NOT_RETRYABLE_PATTERN.test(msg)) return false;
  return RETRYABLE_PATTERN.test(msg);
}

export async function withGeminiRetry<T>(
  call: () => Promise<T>,
  opts: { maxRetries?: number; tag?: string } = {}
): Promise<T> {
  const { maxRetries = 3, tag = "gemini" } = opts;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await call();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      // Exponential backoff with jitter — 600 ms, 1.2 s, 2.4 s by default.
      // Total worst-case ~4 s on top of the call itself.
      const delay = 600 * 2 ** attempt + Math.random() * 400;
      const msg = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
      console.warn(
        `[${tag}] attempt ${attempt + 1}/${maxRetries + 1} failed (${msg}), retrying in ${Math.round(delay)}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Run `call` and `parse` its answer; when the answer can't be parsed, ask
 * once more. Now and then an answer stops being JSON partway (packing on
 * 2026-10-16: 1 of ~6 production answers, while 40 replays of the prompt all
 * parsed), and one retry hides it, as suggest's bad-shape retry does.
 * `parse` returns null or throws for an unusable answer. Returns the last
 * answer with its parse (null after two unusable answers).
 */
export async function withParseRetry<A, T>(
  call: () => Promise<A>,
  parse: (answer: A) => T | null,
  opts: { tag?: string } = {}
): Promise<{ answer: A; parsed: T | null }> {
  const { tag = "gemini" } = opts;
  const tryParse = (answer: A): T | null => {
    try {
      return parse(answer);
    } catch {
      return null;
    }
  };
  let answer = await call();
  let parsed = tryParse(answer);
  if (parsed === null) {
    console.warn(`[${tag}] unparseable answer, asking once more`);
    answer = await call();
    parsed = tryParse(answer);
  }
  return { answer, parsed };
}

// The first {...} block of a model answer as an object, or null.
export function parseJsonObject<T>(text: string | undefined): T | null {
  const match = (text ?? "").match(/\{[\s\S]*\}/);
  return match ? (JSON.parse(match[0]) as T) : null;
}

/**
 * Run `call` on each model in order until one answers, each through
 * withGeminiRetry. A model with a fallback behind it gets one retry instead
 * of three, so a 503 spell costs the user ~2 s before the next model takes
 * over. Moves on only for capacity and quota errors (FALLBACK_PATTERN);
 * anything else is thrown as is. Returns the result and the model that
 * produced it, for logAiCall.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  call: (model: string) => Promise<T>,
  opts: { tag?: string } = {}
): Promise<{ result: T; model: string }> {
  const { tag = "gemini" } = opts;
  if (models.length === 0) throw new Error(`[${tag}] no models to call`);
  for (let i = 0; ; i++) {
    const model = models[i];
    const isLast = i === models.length - 1;
    try {
      const result = await withGeminiRetry(() => call(model), { tag, maxRetries: isLast ? 3 : 1 });
      return { result, model };
    } catch (err) {
      if (isLast || !FALLBACK_PATTERN.test(errorText(err))) throw err;
      console.warn(`[${tag}] ${model} unavailable (${errorText(err).slice(0, 120)}), falling back to ${models[i + 1]}`);
    }
  }
}
