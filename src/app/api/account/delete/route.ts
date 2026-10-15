// Linette — account deletion endpoint.
//
// GDPR + App Store / Play Store requirement: every account must be able
// to delete itself. This route:
//   1. Authenticates the caller against the session cookie.
//   2. Cancels their Stripe subscription, if any. Deleting the user used to
//      leave Stripe billing running ($6.99/week for an account that no
//      longer exists), so if the cancel fails we stop here.
//   3. Wipes their files from the `clothing-images` storage bucket
//      (the bucket is user-scoped under `{userId}/...`).
//   4. Calls the Supabase admin `deleteUser` API to remove the auth.users
//      row. Every domain table has `references auth.users(id) on delete
//      cascade`, so the cascade handles preferences, items, outfits,
//      outfit_log, today_outfit, recent_outfits, trips, and subscriptions.
//
// The admin call requires the service-role key — that's why this lives
// behind a server route, never in client code.
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

const STORAGE_BUCKET = "clothing-images";
// Statuses where Stripe would still charge or could resume charging.
const BILLABLE = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);

export async function DELETE() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = userData.user.id;
  const admin = createAdminClient();

  const { data: sub, error: subErr } = await admin
    .from("user_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (subErr) {
    console.error("[account/delete] subscription lookup failed", subErr);
    return NextResponse.json({ error: "Could not check your subscription" }, { status: 500 });
  }
  if (sub?.stripe_subscription_id && BILLABLE.has(sub.status as string)) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id as string);
    } catch (err) {
      const alreadyGone = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
      if (!alreadyGone) {
        console.error("[account/delete] Stripe cancel failed", err);
        return NextResponse.json(
          { error: "Could not cancel your subscription. Nothing was deleted, please try again." },
          { status: 502 }
        );
      }
    }
  }

  // Storage cascade is not automatic — list everything under the user's
  // folder in the clothing-images bucket and delete the paths explicitly.
  // `list` returns one page at a time, so loop until a short page.
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
