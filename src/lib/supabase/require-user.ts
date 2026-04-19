import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
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

  return { supabase, userId: user.id };
}

export function isNextResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
