// Linette — user data export endpoint.
//
// GDPR (Article 20 — right to data portability) + App Store requirement:
// every account must be able to download a copy of its own data. This
// route reads every domain table that has `user_id = auth.uid()` and
// returns them as a single JSON file with a Content-Disposition
// download header so the browser saves it.
//
// Storage objects (clothing images in `clothing-images/{userId}/`) are
// NOT inlined as base64 — that would balloon the file. Instead each
// clothing_item already carries its public storage URL in the row, so
// the export gives the user the URLs and they can wget / right-click
// save the images they care about.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tables to dump. `subscriptions` is intentionally omitted —
// payment-provider records belong to RevenueCat / Stripe and shouldn't
// be re-distributed as part of a user-data export.
const TABLES = [
  "user_preferences",
  "clothing_items",
  "outfits",
  "outfit_log",
  "today_outfit",
  "recent_outfits",
  "trips",
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = userData.user;
  const userId = user.id;

  const dump: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    },
  };

  for (const table of TABLES) {
    // RLS already restricts each row to `auth.uid() = user_id`, so the
    // unfiltered `select` here only ever returns the caller's rows.
    // Keeping the explicit `.eq("user_id", userId)` is belt-and-braces
    // — if RLS is ever loosened in the future, this still scopes the
    // dump correctly.
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId);
    if (error) {
      console.error(`[account/export] table ${table} failed`, error);
      return NextResponse.json(
        { error: `Could not read ${table}` },
        { status: 500 }
      );
    }
    dump[table] = data ?? [];
  }

  const body = JSON.stringify(dump, null, 2);
  const dateStamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `linette-data-${dateStamp}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Don't let any CDN cache the dump — it's per-user and
      // contains private data.
      "Cache-Control": "no-store",
    },
  });
}
