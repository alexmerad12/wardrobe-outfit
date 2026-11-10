// Linette — "Report this result" on AI output (2026-11-09).
//
// Google Play's AI-generated content policy: people must be able to flag
// offensive AI content without leaving the app. The Report control on an
// outfit, a try-on or a packing list posts here. One row goes into
// `ai_reports` (insert-only for the caller, read in /admin with the service
// key), and an "offensive" report is also emailed to the support inbox at
// once, because that one can't wait for someone to open /admin.
import { after, NextRequest, NextResponse } from "next/server";
import { requireUser, isNextResponse } from "@/lib/supabase/require-user";
import { readJsonObject } from "@/lib/read-json";
import { dbErrorResponse } from "@/lib/db-error";
import { consumeDailyCap, refundDailyCap, localDayKey } from "@/lib/daily-cap";
import { parseReport, type ParsedReport } from "@/lib/ai-report";

const SUPPORT_TO = "hello@linette.app";
// Same verified sender as /api/feedback.
const SUPPORT_FROM = "Linette Feedback <feedback@linette.app>";
// Generous for an honest user, small enough that the table and the inbox
// can't be flooded.
const REPORT_DAILY_CAP = 20;

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Best effort, after the response is sent: the report is already saved.
function emailOffensiveReport(report: ParsedReport, userId: string, userEmail: string | null | undefined): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const send = async () => {
    const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;color:#1a1a1a;">
  <p><strong>Reported as offensive:</strong> ${escapeHtml(report.feature)}</p>
  <p><strong>From:</strong> ${escapeHtml(userEmail ?? "(no email)")} (user_id: ${userId})</p>
  ${report.note ? `<p><strong>Note:</strong> ${escapeHtml(report.note)}</p>` : ""}
  <p><strong>What they saw:</strong></p>
  <pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;background:#f6f6f6;padding:12px 14px;border-radius:8px;">${escapeHtml(JSON.stringify(report.content, null, 2).slice(0, 4000))}</pre>
  <p style="font-size:12px;color:#666;">Every report is listed in /admin.</p>
</div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: SUPPORT_FROM,
        to: SUPPORT_TO,
        subject: `[Linette report · offensive] ${report.feature}`,
        html,
      }),
    }).catch(() => {});
  };
  try {
    after(send);
  } catch {
    void send();
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (isNextResponse(ctx)) return ctx;

  const body = await readJsonObject(request);
  if (isNextResponse(body)) return body;
  const parsed = parseReport(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const report = parsed.value;

  const countKey = `report_count:${ctx.userId}:${localDayKey(request)}`;
  const capCount = await consumeDailyCap(countKey);
  if (capCount > REPORT_DAILY_CAP) {
    return NextResponse.json({ error: "daily_limit_reached", limit: REPORT_DAILY_CAP }, { status: 429 });
  }

  // No .select(): the caller may insert a report, never read one back.
  const { error } = await ctx.supabase.from("ai_reports").insert({
    user_id: ctx.userId,
    feature: report.feature,
    reason: report.reason,
    note: report.note,
    content: report.content,
    locale: report.locale,
  });
  if (error) {
    if (capCount !== -1) refundDailyCap(countKey);
    return dbErrorResponse(error);
  }

  if (report.reason === "offensive") {
    emailOffensiveReport(report, ctx.userId, ctx.userEmail);
  }
  return NextResponse.json({ ok: true });
}
