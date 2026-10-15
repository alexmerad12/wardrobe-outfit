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

const RETRYABLE_PATTERN =
  /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|socket hang up|other side closed/i;
const NOT_RETRYABLE_PATTERN = /PerDay[A-Za-z]*-FreeTier/;

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  // The new @google/genai SDK throws ApiError with a JSON-stringified
  // detail; older paths just throw plain Errors. Match against the
  // serialised message.
  const cause = err instanceof Error && err.cause ? ` ${String((err.cause as Error).message ?? err.cause)}` : "";
  const msg = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) + cause;
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
