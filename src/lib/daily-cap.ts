import { kv } from "@vercel/kv";
import * as Sentry from "@sentry/nextjs";

// Shared per-user daily-cap counter for the AI endpoints.
//
// Contract (audit Group C4):
//  - consume AFTER request validation / free early-exits, so malformed
//    requests and thin wardrobes don't burn quota;
//  - refund when the request fails to deliver value (5xx, AI produced
//    nothing) — errors no longer lock users out for the day;
//  - KV outage fails OPEN (caps disabled) but LOUDLY: every occurrence
//    logs and reaches Sentry. Previously `.catch(() => -1)` disabled
//    every cap in total silence.

// User-local YYYY-MM-DD for cap keys. Caps used to roll over at UTC
// midnight — 8pm in Québec — giving evening users a double daily
// budget while the "try again tomorrow" copy was wrong in both
// directions (audit C5). Vercel's IP-timezone header gives a good-
// enough local day; UTC remains the fallback (local dev, unknown IPs).
// The existing 36h TTL on cap keys already covers the wraparound.
export function localDayKey(request: {
  headers: { get(name: string): string | null };
}): string {
  const tz = request.headers.get("x-vercel-ip-timezone");
  if (tz) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      // Unrecognized timezone string — fall through to UTC.
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export async function consumeDailyCap(key: string): Promise<number> {
  let count: number;
  try {
    count = await kv.incr(key);
  } catch (err) {
    console.error(`[caps] KV unavailable — cap fail-open for ${key}:`, err);
    Sentry.captureMessage("KV unavailable — daily caps fail-open", "warning");
    return -1;
  }
  if (count === 1) {
    // 36h TTL: covers timezone wraparound on the UTC-dated key.
    kv.expire(key, 60 * 60 * 36).catch(() => {});
  }
  return count;
}

export function refundDailyCap(key: string): void {
  kv.decr(key).catch(() => {});
}
