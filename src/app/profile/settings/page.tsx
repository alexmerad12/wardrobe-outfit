// Settings + Account live on their own page so /profile stays the
// engaging surface (stats, insights, "What you can do") and isn't
// dominated by utility forms. Reachable via a gear icon in the
// /profile header. Standard pattern (Instagram, Spotify, every
// modern app does this). Preferences and Account & security each open
// a page of their own from a row here (Preferences since 2026-11-22,
// the owner's ask: its form used to open in full at the top).
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, LogOut, ChevronRight, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/use-locale";
import { invalidatePreferences } from "@/lib/preferences-client";

type Sub = {
  status: string;
  plan: "weekly" | "annual" | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  // Who sold it: Stripe on linette.app, Google Play in the Android app.
  source: "stripe" | "play" | null;
  store_product_id: string | null;
};

// Google Play's own page for one subscription of one app. In the Android
// app the link leaves the WebView and Google Play opens it.
function googlePlaySubscriptionUrl(storeProductId: string | null): string {
  const url = new URL("https://play.google.com/store/account/subscriptions");
  url.searchParams.set("package", "app.linette");
  const product = storeProductId?.split(":")[0];
  if (product) url.searchParams.set("sku", product);
  return url.toString();
}

// One row of the Settings menu: a page of its own behind a chevron.
const ROW_CLASS =
  "flex items-center justify-between w-full rounded-lg border border-input bg-background px-4 py-3 hover:bg-muted";

export default function SettingsPage() {
  const { t, locale } = useLocale();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Subscription state — loaded straight from supabase (RLS allows
  // user to read own row). Null while loading and for users who
  // never completed checkout (those should be on /paywall anyway,
  // unless they're admin-bypassed).
  const [sub, setSub] = useState<Sub | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  // Send-feedback dialog state. The form POSTs to /api/feedback which
  // forwards the message via Resend to hello@linette.app — no
  // database row, the support inbox is the source of truth.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"bug" | "idea" | "other">("other");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user?.id) {
        const { data: subRow } = await supabase
          .from("user_subscriptions")
          .select("status, plan, current_period_end, cancel_at_period_end, source, store_product_id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        setSub((subRow as Sub | null) ?? null);
      }
      setSubLoaded(true);
    });
  }, []);

  async function handleManageBilling() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      if (!res.ok) throw new Error("billing portal");
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      console.error(err);
      setOpeningPortal(false);
    }
  }

  function openFeedbackDialog() {
    setFeedbackType("other");
    setFeedbackMessage("");
    setFeedbackError(null);
    setFeedbackSent(false);
    setFeedbackOpen(true);
  }

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackError(null);
    const trimmed = feedbackMessage.trim();
    if (!trimmed) return;
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feedbackType, message: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Feedback failed");
      }
      setFeedbackSent(true);
    } catch {
      setFeedbackError(t("profile.feedbackFailed"));
    } finally {
      setFeedbackSending(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    invalidatePreferences();
    // Full reload on purpose: drops every bit of signed-in client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }


  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8">
      {/* Header — back arrow + page title. Bottom nav stays visible
          (settings is a sub-page of profile, not a focused workflow). */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/profile"
          className="tap inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{t("profile.settings")}</h1>
      </div>

      {/* Subscription card — only renders once we've loaded the row.
          Hides entirely for admin/bypass users who'll never have a
          stripe_customer_id; they shouldn't see a "Manage" button
          that 404s. */}
      {subLoaded && sub?.status && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t("profile.subscriptionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("profile.subPlan")}
              </span>
              <span className="text-sm font-medium">
                {sub.plan === "annual"
                  ? t("paywall.annualLabel")
                  : sub.plan === "weekly"
                  ? t("paywall.weeklyLabel")
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("profile.subStatus")}
              </span>
              <span className="text-sm font-medium capitalize">
                {sub.status === "trialing"
                  ? t("profile.subTrialing")
                  : sub.status === "active"
                  ? t("profile.subActive")
                  : sub.status === "past_due"
                  ? t("profile.subPastDue")
                  : sub.status === "canceled"
                  ? t("profile.subCanceled")
                  : sub.status}
              </span>
            </div>
            {sub.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {sub.cancel_at_period_end
                    ? t("profile.subEndsOn")
                    : t("profile.subRenewsOn")}
                </span>
                <span className="text-sm font-medium">
                  {new Date(sub.current_period_end).toLocaleDateString(
                    locale === "fr" ? "fr-FR" : "en-US",
                    { year: "numeric", month: "short", day: "numeric" }
                  )}
                </span>
              </div>
            )}
            {sub.source === "play" ? (
              // Bought in the Android app: Google Play bills it, and only
              // Google Play can change or cancel it.
              <a
                href={googlePlaySubscriptionUrl(sub.store_product_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-h flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t("profile.manageInGooglePlay")}
              </a>
            ) : (
              <>
                {/* Stripe's portal is a payment page of another seller:
                    never opened from inside the Android app. */}
                <div className="web-only">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleManageBilling}
                    disabled={openingPortal}
                  >
                    {openingPortal ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("paywall.openingCheckout")}
                      </>
                    ) : (
                      t("profile.manageBilling")
                    )}
                  </Button>
                </div>
                <p className="shell-only text-sm text-muted-foreground">
                  {t("profile.manageOnWebsite")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub-page nav rows — sit above the Sign-in card so the
          Sign-out button is the visual terminus of the page (the
          last thing you'd do before leaving). Preferences, privacy &
          help live here as navigational entries, not destructive
          actions. */}
      <div className="space-y-2 mb-6">
        <Link href="/profile/settings/preferences" className={ROW_CLASS}>
          <span className="font-heading text-base leading-snug font-medium">
            {t("profile.preferencesTitle")}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link href="/profile/settings/privacy" className={ROW_CLASS}>
          <span className="font-heading text-base leading-snug font-medium">
            {t("profile.privacyAndData")}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link href="/faq" className={ROW_CLASS}>
          <span className="font-heading text-base leading-snug font-medium">
            {t("profile.helpAndFaq")}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <button
          type="button"
          onClick={openFeedbackDialog}
          className={`${ROW_CLASS} text-left`}
        >
          <span className="font-heading text-base leading-snug font-medium">
            {t("profile.sendFeedback")}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Account card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {userEmail && (
            <p className="text-sm text-muted-foreground break-all">{userEmail}</p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("profile.signingOut")}
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                {t("profile.signOut")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Contact link — a quieter "fine print" line at the very bottom
          of settings. Sized down vs the Account & security row because
          most users will never need it; the few who do (account
          recovery, bug reports, billing questions) will spot it. */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        {t("profile.needHelp")}{" "}
        <a
          href="mailto:hello@linette.app"
          className="underline underline-offset-2 hover:text-foreground"
        >
          hello@linette.app
        </a>
      </p>

      <Dialog open={feedbackOpen} onOpenChange={(open) => !feedbackSending && setFeedbackOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.sendFeedback")}</DialogTitle>
            <DialogDescription>{t("profile.feedbackIntro")}</DialogDescription>
          </DialogHeader>

          {feedbackSent ? (
            <div className="space-y-3">
              <p className="text-sm italic text-muted-foreground" role="status">
                {t("profile.feedbackSentSuccess")}
              </p>
              <Button className="w-full" onClick={() => setFeedbackOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="feedback-type" className="text-sm">
                  {t("profile.feedbackTypeLabel")}
                </Label>
                <Select
                  value={feedbackType}
                  onValueChange={(v) => setFeedbackType(v as "bug" | "idea" | "other")}
                >
                  <SelectTrigger id="feedback-type" className="w-full">
                    <SelectValue>
                      {(value) => {
                        if (value === "bug") return t("profile.feedbackTypeBug");
                        if (value === "idea") return t("profile.feedbackTypeIdea");
                        if (value === "other") return t("profile.feedbackTypeOther");
                        return null;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">{t("profile.feedbackTypeBug")}</SelectItem>
                    <SelectItem value="idea">{t("profile.feedbackTypeIdea")}</SelectItem>
                    <SelectItem value="other">{t("profile.feedbackTypeOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feedback-message" className="text-sm">
                  {t("profile.feedbackMessageLabel")}
                </Label>
                <Textarea
                  id="feedback-message"
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder={t("profile.feedbackMessagePlaceholder")}
                  required
                  maxLength={5000}
                  rows={6}
                  disabled={feedbackSending}
                />
              </div>

              {feedbackError && (
                <p className="text-sm text-destructive" role="alert">
                  {feedbackError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFeedbackOpen(false)}
                  disabled={feedbackSending}
                >
                  {t("profile.cancel")}
                </Button>
                <Button type="submit" disabled={feedbackSending || !feedbackMessage.trim()}>
                  {feedbackSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("profile.feedbackSending")}
                    </>
                  ) : (
                    t("profile.feedbackSubmit")
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
