// The "Report this result" control on AI output (2026-11-09). Google Play's
// AI-generated content policy asks that people can flag offensive AI
// content without leaving the app. One row per report in `ai_reports`
// (supabase-migration-consent-and-reports.sql): what they saw, why they
// flag it, an optional note. These lists must match the table's checks.
export const REPORT_FEATURES = ["suggest", "refine", "try_on", "packing", "analyze_item"] as const;
export type ReportFeature = (typeof REPORT_FEATURES)[number];

export const REPORT_REASONS = ["offensive", "inaccurate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_NOTE_MAX = 2000;
// The snapshot of what the person saw: names, ids and sentences, never
// photos. 20 KB is far above any real result and far below abuse.
export const REPORT_CONTENT_MAX_BYTES = 20_000;

export type ParsedReport = {
  feature: ReportFeature;
  reason: ReportReason;
  note: string | null;
  content: Record<string, unknown>;
  locale: "en" | "fr" | null;
};

export type ReportParseResult =
  | { ok: true; value: ParsedReport }
  | { ok: false; status: 400 | 413; error: string };

export function parseReport(body: Record<string, unknown>): ReportParseResult {
  const feature = body.feature;
  if (typeof feature !== "string" || !(REPORT_FEATURES as readonly string[]).includes(feature)) {
    return { ok: false, status: 400, error: "unknown_feature" };
  }
  const reason = body.reason;
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, status: 400, error: "unknown_reason" };
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return { ok: false, status: 400, error: "invalid_note" };
    const trimmed = body.note.trim();
    if (trimmed.length > REPORT_NOTE_MAX) return { ok: false, status: 413, error: "note_too_long" };
    note = trimmed || null;
  }
  const content = body.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, status: 400, error: "invalid_content" };
  }
  if (new TextEncoder().encode(JSON.stringify(content)).length > REPORT_CONTENT_MAX_BYTES) {
    return { ok: false, status: 413, error: "content_too_large" };
  }
  const locale = body.locale === "fr" ? "fr" : body.locale === "en" ? "en" : null;
  return {
    ok: true,
    value: {
      feature: feature as ReportFeature,
      reason: reason as ReportReason,
      note,
      content: content as Record<string, unknown>,
      locale,
    },
  };
}
