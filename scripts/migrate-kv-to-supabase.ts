/**
 * One-shot migration: reads the legacy global Vercel KV wardrobe-data blob and
 * inserts every row into Supabase under a target user's user_id.
 *
 * Usage: npx tsx scripts/migrate-kv-to-supabase.ts <targetEmail>
 *   e.g. npx tsx scripts/migrate-kv-to-supabase.ts sephora131313@gmail.com
 *
 * Reads env from .env.local (Supabase) + .env.vercel (KV). Loads both.
 */

import { config as loadEnv } from "dotenv";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient as createKvClient } from "@vercel/kv";

// Load .env.local first (Supabase), then .env.vercel (KV). dotenv won't overwrite
// existing vars, so the order matters only if both define the same key.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.vercel" });

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error("Usage: npx tsx scripts/migrate-kv-to-supabase.ts <targetEmail>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error("Missing Supabase env vars (check .env.local)");
  process.exit(1);
}
if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.error("Missing Vercel KV env vars (check .env.vercel)");
  process.exit(1);
}

const supabase = createSupabase(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const kv = createKvClient({
  url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN,
});

type AppData = {
  items: Record<string, unknown>[];
  outfits: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  today_outfit: Record<string, unknown> | null;
  recent_outfits: Record<string, unknown>[];
  trips: Record<string, unknown>[];
};

async function findUserIdByEmail(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const match = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!match) throw new Error(`No Supabase user found for ${email}`);
  return match.id;
}

function strip(obj: Record<string, unknown>, keys: string[]) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

async function main() {
  console.log(`> Target email: ${targetEmail}`);
  const userId = await findUserIdByEmail(targetEmail);
  console.log(`> Resolved user_id: ${userId}`);

  console.log(`> Reading Vercel KV blob...`);
  const data = (await kv.get<AppData>("wardrobe-data")) ?? null;
  if (!data) {
    console.error("No wardrobe-data in KV. Nothing to migrate.");
    process.exit(1);
  }

  const items = data.items ?? [];
  const outfits = data.outfits ?? [];
  const logs = data.logs ?? [];
  const preferences = data.preferences;
  const todayOutfit = data.today_outfit;
  const recentOutfits = data.recent_outfits ?? [];
  const trips = data.trips ?? [];

  console.log(
    `> KV counts: ${items.length} items, ${outfits.length} outfits, ${logs.length} logs, ${trips.length} trips, ${recentOutfits.length} recent, today_outfit: ${todayOutfit ? "yes" : "no"}, prefs: ${preferences ? "yes" : "no"}`
  );

  // --- Clothing items ---
  if (items.length > 0) {
    const rows = items.map((i) => ({
      ...strip(i, []),
      user_id: userId,
    }));
    const { error } = await supabase.from("clothing_items").insert(rows);
    if (error) {
      console.error(`  items insert failed:`, error.message);
    } else {
      console.log(`  ✓ inserted ${rows.length} clothing_items`);
    }
  }

  // --- Outfits ---
  if (outfits.length > 0) {
    const rows = outfits.map((o) => {
      const { items: _items, ...rest } = o as Record<string, unknown> & {
        items?: unknown;
      };
      return { ...rest, user_id: userId };
    });
    const { error } = await supabase.from("outfits").insert(rows);
    if (error) {
      console.error(`  outfits insert failed:`, error.message);
    } else {
      console.log(`  ✓ inserted ${rows.length} outfits`);
    }
  }

  // --- Logs ---
  if (logs.length > 0) {
    const rows = logs.map((l) => ({ ...l, user_id: userId }));
    const { error } = await supabase.from("outfit_log").insert(rows);
    if (error) {
      console.error(`  outfit_log insert failed:`, error.message);
    } else {
      console.log(`  ✓ inserted ${rows.length} outfit_log`);
    }
  }

  // --- User preferences (upsert) ---
  if (preferences) {
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ ...preferences, user_id: userId }, { onConflict: "user_id" });
    if (error) {
      console.error(`  preferences upsert failed:`, error.message);
    } else {
      console.log(`  ✓ upserted user_preferences`);
    }
  }

  // --- Today's outfit ---
  if (todayOutfit) {
    const { error } = await supabase
      .from("today_outfit")
      .upsert({ ...todayOutfit, user_id: userId }, { onConflict: "user_id" });
    if (error) {
      console.error(`  today_outfit upsert failed:`, error.message);
    } else {
      console.log(`  ✓ upserted today_outfit`);
    }
  }

  // --- Recent outfits ---
  if (recentOutfits.length > 0) {
    const rows = recentOutfits.map((r) => {
      const row = { ...r, user_id: userId } as Record<string, unknown>;
      delete row.id;
      return row;
    });
    const { error } = await supabase.from("recent_outfits").insert(rows);
    if (error) {
      console.error(`  recent_outfits insert failed:`, error.message);
    } else {
      console.log(`  ✓ inserted ${rows.length} recent_outfits`);
    }
  }

  // --- Trips ---
  if (trips.length > 0) {
    const rows = trips.map((t) => ({ ...t, user_id: userId }));
    const { error } = await supabase.from("trips").insert(rows);
    if (error) {
      console.error(`  trips insert failed:`, error.message);
    } else {
      console.log(`  ✓ inserted ${rows.length} trips`);
    }
  }

  console.log(`> Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
