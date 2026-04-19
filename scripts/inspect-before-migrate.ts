/**
 * Dry-run inspector. Looks up the target user_id and prints KV data counts.
 * No writes. Usage: npx tsx scripts/inspect-before-migrate.ts <email>
 */
import { config as loadEnv } from "dotenv";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient as createKvClient } from "@vercel/kv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.vercel" });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/inspect-before-migrate.ts <email>");
  process.exit(1);
}

const supabase = createSupabase(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const kv = createKvClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  console.log("== Supabase user lookup ==");
  console.log(`  email: ${email}`);
  console.log(`  found: ${user ? "YES" : "NO"}`);
  if (user) console.log(`  user_id: ${user.id}`);

  console.log("\n== All users in Supabase ==");
  for (const u of data.users) {
    console.log(`  ${u.email} (${u.id})`);
  }

  const blob = await kv.get<Record<string, unknown>>("wardrobe-data");
  console.log("\n== KV wardrobe-data ==");
  if (!blob) {
    console.log("  (empty)");
    return;
  }
  const counts: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(blob)) {
    if (Array.isArray(v)) counts[k] = v.length;
    else if (v === null) counts[k] = "null";
    else counts[k] = "present";
  }
  console.log(counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
