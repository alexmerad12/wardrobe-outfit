// Account & security — sub-page that gathers all sensitive account
// actions (password change, GDPR data export, account deletion) one
// click deeper than /profile/settings so they don't compete with
// everyday preferences. Pattern borrowed from Apple iCloud / GitHub
// Account Settings.
"use client";

import { useEffect, useState } from "react";
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
import { ArrowLeft, Loader2, Trash2, Download, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/use-locale";

export default function AccountSecurityPage() {
  const { t } = useLocale();

  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Change password dialog state
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Need the email for the change-password verify step (Supabase
  // doesn't have a direct "verify current password" API — we re-sign
  // in with the user's email + claimed current password).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? null);
    });
  }, []);

  function openPasswordDialog() {
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setPwdError(null);
    setPwdSuccess(false);
    setPwdOpen(true);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);

    if (newPwd.length < 8) {
      setPwdError(t("auth.passwordRequirement"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError(t("auth.passwordsDoNotMatch"));
      return;
    }
    if (!userEmail) {
      setPwdError(t("profile.changePasswordFailed"));
      return;
    }

    setPwdSaving(true);
    const supabase = createClient();

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPwd,
    });
    if (signInErr) {
      setPwdSaving(false);
      setPwdError(t("profile.changePasswordCurrentWrong"));
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPwd,
    });
    if (updateErr) {
      setPwdSaving(false);
      setPwdError(updateErr.message);
      return;
    }

    setPwdSaving(false);
    setPwdSuccess(true);
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  }

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
        <h1 className="font-[family-name:var(--font-heading)] text-2xl">
          {t("profile.privacyAndData")}
        </h1>
      </div>

      {/* Password change — most common security action; placed first
          so users don't have to scroll past data export to find it. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={openPasswordDialog}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("profile.changePassword")}
          </Button>
        </CardContent>
      </Card>

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

      <Dialog open={pwdOpen} onOpenChange={(open) => !pwdSaving && setPwdOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.changePassword")}</DialogTitle>
            <DialogDescription>{t("profile.changePasswordSub")}</DialogDescription>
          </DialogHeader>

          {pwdSuccess ? (
            <div className="space-y-3">
              <p className="text-sm italic text-muted-foreground" role="status">
                {t("profile.changePasswordSuccess")}
              </p>
              <Button className="w-full" onClick={() => setPwdOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <Label htmlFor="current-password" className="text-sm">
                  {t("profile.changePasswordCurrent")}
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  disabled={pwdSaving}
                />
              </div>
              <div>
                <Label htmlFor="new-password" className="text-sm">
                  {t("profile.changePasswordNew")}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  disabled={pwdSaving}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("auth.passwordHint")}
                </p>
              </div>
              <div>
                <Label htmlFor="confirm-new-password" className="text-sm">
                  {t("auth.confirmPassword")}
                </Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  disabled={pwdSaving}
                />
              </div>

              {pwdError && (
                <p className="text-sm text-destructive" role="alert">
                  {pwdError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPwdOpen(false)}
                  disabled={pwdSaving}
                >
                  {t("profile.cancel")}
                </Button>
                <Button type="submit" disabled={pwdSaving}>
                  {pwdSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("profile.changingPassword")}
                    </>
                  ) : (
                    t("profile.changePasswordConfirm")
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
