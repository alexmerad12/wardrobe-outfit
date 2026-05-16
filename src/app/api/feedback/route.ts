// Linette — in-app feedback intake.
//
// User opens the Send Feedback dialog in Settings, picks a type
// (bug / idea / other), writes a message, and submits. We forward
// it as an email to hello@linette.app via Resend. No database
// table — the support inbox is the source of truth.
//
// Requires auth so only signed-in users can send, and so we always
// know who the message is from (the email + user id are embedded
// in the forwarded message).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";

const SUPPORT_TO = "hello@linette.app";
// Sender must be on a verified Resend domain. linette.app is verified
// (see Resend dashboard); using a no-reply subdomain prefix keeps
// inbound replies from accumulating in some empty mailbox.
const SUPPORT_FROM = "Linette Feedback <feedback@linette.app>";

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;
  const { supabase, userId } = ctx;

  // requireUser only returns supabase + userId; fetch the email so we
  // can include it in the forwarded message + use it as Reply-To.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  let body: { message?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { error: "Message too long" },
      { status: 413 }
    );
  }

  const rawType = typeof body.type === "string" ? body.type : "other";
  const type = TYPE_LABELS[rawType] ? rawType : "other";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[feedback] RESEND_API_KEY missing — cannot forward");
    return NextResponse.json(
      { error: "Feedback service unavailable" },
      { status: 503 }
    );
  }

  const subject = `[Linette feedback · ${TYPE_LABELS[type]}] ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`;

  // Plain HTML — the operator's eyeballs are reading it in Gmail.
  // Pre tags preserve user line breaks without us doing escaping
  // for newline conversion. Basic HTML escape on the message body
  // so a user can't smuggle markup into the reply preview.
  const safe = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;color:#1a1a1a;">
  <p><strong>Type:</strong> ${TYPE_LABELS[type]}</p>
  <p><strong>From:</strong> ${safe(userEmail ?? "(no email)")} (user_id: ${userId})</p>
  <p><strong>Message:</strong></p>
  <pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;background:#f8f6f1;padding:14px 16px;border:1px solid #eee;border-radius:6px;">${safe(message)}</pre>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: SUPPORT_FROM,
      to: SUPPORT_TO,
      // Reply-To set to the user's real email so replying in Gmail
      // goes back to them rather than to feedback@linette.app (which
      // is just a send-from alias, no inbox attached).
      reply_to: userEmail ?? undefined,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[feedback] Resend forward failed", res.status, errText);
    return NextResponse.json(
      { error: "Could not send feedback. Please email hello@linette.app instead." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
