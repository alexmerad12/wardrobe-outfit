/**
 * Cross-tenant RLS security test. Creates a throwaway user, has them query
 * clothing_items, confirms they cannot see wife's data. Then deletes the test user.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testEmail = `intruder-${Date.now()}@closette.test`;
const testPassword = "IntruderTest1234!";

async function main() {
  console.log("=== Cross-Tenant RLS Security Test ===\n");

  // Step 1: Baseline - count wife's items via admin (bypasses RLS)
  console.log("[1] Admin count of wife's data (bypasses RLS):");
  const { data: wife } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const wifeRow = wife.users.find(
    (u) => u.email === "sephora131313@gmail.com"
  );
  if (!wifeRow) throw new Error("Wife not found");
  console.log(`    wife user_id: ${wifeRow.id}`);

  const { count: wifeItems } = await admin
    .from("clothing_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", wifeRow.id);
  console.log(`    wife clothing_items: ${wifeItems}`);

  // Step 2: Create throwaway attacker user
  console.log(`\n[2] Creating throwaway user: ${testEmail}`);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("create failed");
  const attackerId = created.user.id;
  console.log(`    attacker user_id: ${attackerId}`);

  // Step 3: Sign in as attacker via anon client (this is what a real client does)
  console.log(`\n[3] Signing in as attacker with anon client (real-user mode)`);
  const attackerClient = createClient(URL, ANON);
  const { error: signInErr } = await attackerClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (signInErr) throw signInErr;
  console.log(`    signed in, JWT acquired`);

  // Step 4: Attempt — plain select across clothing_items
  console.log(`\n[4] Attacker: SELECT * FROM clothing_items`);
  const { data: selAll, error: selErr } = await attackerClient
    .from("clothing_items")
    .select("*");
  if (selErr) console.log(`    error (expected OK): ${selErr.message}`);
  console.log(`    rows returned: ${selAll?.length ?? 0} (expected 0)`);

  // Step 5: Attempt — explicit filter for wife's user_id
  console.log(`\n[5] Attacker: SELECT with explicit filter user_id=wife`);
  const { data: selHers } = await attackerClient
    .from("clothing_items")
    .select("*")
    .eq("user_id", wifeRow.id);
  console.log(`    rows returned: ${selHers?.length ?? 0} (expected 0)`);

  // Step 6: Attempt — insert a row claiming to be wife
  console.log(`\n[6] Attacker: INSERT claiming user_id=wife`);
  const { error: insErr } = await attackerClient.from("clothing_items").insert({
    user_id: wifeRow.id,
    image_url: "https://example.com/evil.jpg",
    name: "Injected item",
    category: "top",
  });
  console.log(
    insErr
      ? `    BLOCKED (expected): ${insErr.message}`
      : `    !!! INSERT SUCCEEDED — RLS FAILURE`
  );

  // Step 7: Attempt — update wife's real items
  console.log(`\n[7] Attacker: UPDATE wife's items`);
  const { data: upd, error: updErr } = await attackerClient
    .from("clothing_items")
    .update({ name: "pwned" })
    .eq("user_id", wifeRow.id)
    .select();
  console.log(
    updErr
      ? `    error: ${updErr.message}`
      : `    rows modified: ${upd?.length ?? 0} (expected 0)`
  );

  // Step 8: Attempt — delete wife's items
  console.log(`\n[8] Attacker: DELETE wife's items`);
  const { data: del, error: delErr } = await attackerClient
    .from("clothing_items")
    .delete()
    .eq("user_id", wifeRow.id)
    .select();
  console.log(
    delErr
      ? `    error: ${delErr.message}`
      : `    rows deleted: ${del?.length ?? 0} (expected 0)`
  );

  // Step 9: Verify wife's data intact
  console.log(`\n[9] Verifying wife's data is untouched:`);
  const { count: wifeItemsAfter } = await admin
    .from("clothing_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", wifeRow.id);
  console.log(
    `    wife clothing_items after attack: ${wifeItemsAfter} (was ${wifeItems})`
  );

  // Step 10: Cleanup
  console.log(`\n[10] Deleting throwaway user`);
  const { error: delUserErr } = await admin.auth.admin.deleteUser(attackerId);
  if (delUserErr) console.log(`    cleanup failed: ${delUserErr.message}`);
  else console.log(`    ✓ deleted ${testEmail}`);

  // Verdict
  console.log(`\n=== Verdict ===`);
  const pass =
    (selAll?.length ?? 0) === 0 &&
    (selHers?.length ?? 0) === 0 &&
    !!insErr &&
    (upd?.length ?? 0) === 0 &&
    (del?.length ?? 0) === 0 &&
    wifeItemsAfter === wifeItems;
  console.log(pass ? "✓ PASS — RLS holds. Cross-tenant access blocked." : "✗ FAIL — review output above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
