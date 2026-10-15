// Redis (Upstash): daily AI caps, upload counters, recent-suggestion memory.
// This is the store the old Vercel KV integration moved to; it reads the
// same KV_REST_API_* env vars. @vercel/kv itself is deprecated, so the
// app talks to Upstash's own client. Created on first use so a missing env
// var fails the call (which every caller tolerates) instead of the import.
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function kv(): Redis {
  if (!client) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN not set");
    client = new Redis({ url, token });
  }
  return client;
}
