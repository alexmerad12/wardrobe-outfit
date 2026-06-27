import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
  // Carrying the email + creation date avoids a second
  // supabase.auth.getUser() call in route handlers that need to check
  // the admin-bypass allowlist (cap bypass) or the paywall grandfather
  // cutoff (beta-user free-access carveout).
  userEmail: string | null;
  userCreatedAt: string | null;
};

/**
 * Returns the authed user + a scoped Supabase client for route handlers.
 * The proxy already 401s unauth'd requests, so this is a belt-and-suspenders
 * guard — still return 401 if for any reason no user is present.
 */
export async function requireUser(): Promise<
  AuthedContext | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    userCreatedAt: user.created_at ?? null,
  };
}

export function isNextResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
