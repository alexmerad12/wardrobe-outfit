import { createClient } from "@supabase/supabase-js";

/**
 * Admin client — bypasses RLS. Server-only. Never import this from client code.
 * Use only for trusted operations like the one-time data migration script.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
