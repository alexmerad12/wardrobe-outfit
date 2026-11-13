import * as Sentry from "@sentry/nextjs";
import { kv } from "@/lib/kv";

// What the Redis store (Upstash) holds about one account, all under keys
// that carry the user id after a colon:
//   <feature>_count:<userId>:<day or month>   the usage limits (expire)
//   recent-suggestions:<userId>               a week of recent outfits
//   items_uploaded:<userId>                   a running total, no expiry
// Account deletion removes them with the account, so "your data is
// deleted right away" (the /delete-account page) holds for this store too.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pattern that matches every key of one user, or null when the id is
 *  not a UUID: a loose pattern must never reach a delete. */
export function userKeyPattern(userId: string): string | null {
  return UUID.test(userId) ? `*:${userId}*` : null;
}

/**
 * Deletes every key the store holds for the user. Best effort: an outage
 * is logged and reported, never thrown, because the account itself is
 * already gone when this runs. Returns how many keys went, or -1.
 */
export async function deleteUserKeys(userId: string): Promise<number> {
  const match = userKeyPattern(userId);
  if (!match) return 0;
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await kv().scan(cursor, { match, count: 1000 });
      cursor = String(next);
      keys.push(...batch);
    } while (cursor !== "0");
    if (keys.length > 0) await kv().del(...keys);
    return keys.length;
  } catch (err) {
    console.error("[account/delete] could not clear the usage counters", err);
    Sentry.captureMessage("Account deletion: usage counters not cleared", "warning");
    return -1;
  }
}
