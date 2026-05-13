// Privacy & data — sub-page for GDPR-style account actions.
//
// Lives one click deeper than /profile/settings so the destructive
// "close account" button doesn't compete with everyday preferences in
// the main settings page. Pattern borrowed from Apple iCloud /
// GitHub Account Settings — sensitive actions get their own room.
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Trash2, Download } from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";

export default function PrivacyAndDataPage() {
  const { t } = useLocale();

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleExportData() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "linette-data.json";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t("profile.exportDataFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Delete failed");
      }
      window.location.href = "/launch";
    } catch {
      setDeleting(false);
      setDeleteError(t("profile.deleteAccountFailed"));
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href="/profile/settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">{t("profile.privacyAndData")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.exportData")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {t("profile.exportDataIntro")}
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("profile.exportingData")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("profile.exportData")}
              </>
            )}
          </Button>
          {exportError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {exportError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.closeAccount")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {t("profile.closeAccountIntro")}
          </p>
          <Button
            variant="outline"
            className="w-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setDeleteConfirmText("");
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("profile.deleteAccount")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.deleteAccountTitle")}</DialogTitle>
            <DialogDescription>{t("profile.deleteAccountWarning")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-delete" className="text-sm">
              {t("profile.deleteAccountTypePrompt")}
            </Label>
            <Input
              id="confirm-delete"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={deleting}
            />
            {deleteError && (
              <p className="text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {t("profile.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== "DELETE"}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("profile.deletingAccount")}
                </>
              ) : (
                t("profile.deleteAccountConfirmButton")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
