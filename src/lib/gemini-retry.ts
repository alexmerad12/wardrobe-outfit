// Shared retry wrapper for Gemini calls. The preview models
// (gemini-3-flash-preview specifically) are still capacity-flaky and
// routinely return:
//   - 503 UNAVAILABLE: "This model is currently experiencing high
//     demand. Spikes in demand are usually temporary."
//   - 429 RESOURCE_EXHAUSTED: rate-limit hit
// In both cases the error is transient and the next call usually
// succeeds, so a small exponential backoff is all we need. Without
// this, real users see 1-in-3 analyze calls fail in bulk and bulk
// items save as "Untitled item".

const RETRYABLE_PATTERN =
  /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED)\b/i;

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  // The new @google/genai SDK throws ApiError with a JSON-stringified
  // detail; older paths just throw plain Errors. Match against the
  // serialised message.
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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
