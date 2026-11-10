import { describe, expect, it } from "vitest";
import { parseReport, REPORT_CONTENT_MAX_BYTES, REPORT_NOTE_MAX } from "./ai-report";

const good = { feature: "suggest", reason: "inaccurate", content: { name: "Soft layers", item_ids: ["a", "b"] } };

describe("parseReport", () => {
  it("accepts a report and tidies its note and locale", () => {
    const r = parseReport({ ...good, note: "  two tops  ", locale: "fr" });
    expect(r).toEqual({
      ok: true,
      value: { feature: "suggest", reason: "inaccurate", note: "two tops", content: good.content, locale: "fr" },
    });
    const bare = parseReport(good);
    expect(bare.ok && bare.value.note).toBe(null);
    expect(bare.ok && bare.value.locale).toBe(null);
    const blank = parseReport({ ...good, note: "   " });
    expect(blank.ok && blank.value.note).toBe(null);
  });

  it("refuses what the table would refuse", () => {
    expect(parseReport({ ...good, feature: "wardrobe" })).toMatchObject({ ok: false, status: 400, error: "unknown_feature" });
    expect(parseReport({ ...good, reason: "boring" })).toMatchObject({ ok: false, status: 400, error: "unknown_reason" });
    expect(parseReport({ ...good, note: 12 })).toMatchObject({ ok: false, status: 400, error: "invalid_note" });
    expect(parseReport({ ...good, content: "an outfit" })).toMatchObject({ ok: false, status: 400, error: "invalid_content" });
    expect(parseReport({ ...good, content: ["a"] })).toMatchObject({ ok: false, status: 400, error: "invalid_content" });
    expect(parseReport({ feature: "suggest", reason: "other" })).toMatchObject({ ok: false, status: 400, error: "invalid_content" });
  });

  it("caps the note and the snapshot", () => {
    expect(parseReport({ ...good, note: "x".repeat(REPORT_NOTE_MAX) }).ok).toBe(true);
    expect(parseReport({ ...good, note: "x".repeat(REPORT_NOTE_MAX + 1) })).toMatchObject({ ok: false, status: 413, error: "note_too_long" });
    expect(parseReport({ ...good, content: { blob: "x".repeat(REPORT_CONTENT_MAX_BYTES) } })).toMatchObject({
      ok: false,
      status: 413,
      error: "content_too_large",
    });
  });
});
