// Linette — account deletion endpoint.
//
// GDPR + App Store / Play Store requirement: every account must be able
// to delete itself. This route:
//   1. Authenticates the caller against the session cookie.
//   2. Wipes their files from the `clothing-images` storage bucket
//      (the bucket is user-scoped under `{userId}/...`).
//   3. Calls the Supabase admin `deleteUser` API to remove the auth.users
//      row. Every domain table has `references auth.users(id) on delete
//      cascade`, so the cascade handles preferences, items, outfits,
//      outfit_log, today_outfit, recent_outfits, trips, and subscriptions.
//
// The admin call requires the service-role key — that's why this lives
// behind a server route, never in client code.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "clothing-images";

export async function DELETE() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = userData.user.id;
  const admin = createAdminClient();

  // Storage cascade is not automatic — list everything under the user's
  // folder in the clothing-images bucket and delete the paths explicitly.
  // `list` returns one page at a time; a power user with hundreds of
  // items still fits well under the default limit of 100 most of the
  // time, but loop anyway so this never silently leaks files.
  const filePaths: string[] = [];
  let offset = 0;
  while (true) {
    const { data: files, error: listErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .list(userId, { limit: 100, offset });

    if (listErr) {
      console.error("[account/delete] storage list failed", listErr);
      return NextResponse.json(
        { error: "Could not enumerate storage objects" },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) break;

    for (const f of files) filePaths.push(`${userId}/${f.name}`);

    if (files.length < 100) break;
    offset += files.length;
  }

  if (filePaths.length > 0) {
    const { error: removeErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .remove(filePaths);
    if (removeErr) {
      console.error("[account/delete] storage remove failed", removeErr);
      return NextResponse.json(
        { error: "Could not delete storage objects" },
        { status: 500 }
      );
    }
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error("[account/delete] auth deleteUser failed", deleteErr);
    return NextResponse.json(
      { error: deleteErr.message || "Could not delete account" },
      { status: 500 }
    );
  }

  // Clear the session cookies on the response so the browser can't
  // keep using a token that points at a now-deleted user.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
