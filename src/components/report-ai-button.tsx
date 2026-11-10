"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportFeature, type ReportReason } from "@/lib/ai-report";

// "Report this result" under an AI result (an outfit, a try-on, a packing
// list). Google Play asks that offensive AI content can be flagged without
// leaving the app. `content` is a small snapshot of what the person is
// looking at (names, ids, sentences), saved with the report so it can be
// reviewed later: never pass photos or whole wardrobe objects.

const REASON_KEYS: Record<ReportReason, string> = {
  offensive: "report.reasonOffensive",
  inaccurate: "report.reasonInaccurate",
  other: "report.reasonOther",
};

type Props = {
  feature: ReportFeature;
  content: Record<string, unknown>;
  className?: string;
};

export function ReportAiButton({ feature, content, className }: Props) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("inaccurate");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "limit">("idle");
  const sending = state === "sending";

  function openDialog() {
    setReason("inaccurate");
    setNote("");
    setState("idle");
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setState("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, reason, note, content, locale }),
      });
      if (res.status === 429) {
        setState("limit");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={cn(
          "tap-h inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline",
          className
        )}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {t("report.open")}
      </button>

      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
            <DialogDescription>{t("report.intro")}</DialogDescription>
          </DialogHeader>

          {state === "sent" ? (
            <div className="space-y-4">
              <p className="text-sm" role="status">
                {t("report.sent")}
              </p>
              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  {t("report.close")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset className="space-y-1" disabled={sending}>
                <legend className="mb-1 text-sm font-medium">{t("report.reasonLabel")}</legend>
                {REPORT_REASONS.map((value) => (
                  <label key={value} className="tap-h flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="radio"
                      name="report-reason"
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                      className="h-4 w-4 accent-foreground"
                    />
                    {t(REASON_KEYS[value])}
                  </label>
                ))}
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="report-note">{t("report.noteLabel")}</Label>
                <Textarea
                  id="report-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("report.notePlaceholder")}
                  maxLength={REPORT_NOTE_MAX}
                  rows={3}
                  disabled={sending}
                />
              </div>

              {state === "error" && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {t("report.error")}
                </p>
              )}
              {state === "limit" && (
                <p className="text-sm text-muted-foreground" role="alert">
                  {t("report.limit")}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? t("report.sending") : t("report.send")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
