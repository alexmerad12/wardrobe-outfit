// How to delete a Linette account and its data, readable without signing
// in. Google Play's listing asks for this address (the in-app flow lives in
// Profile > Settings > Account & security, backed by /api/account/delete),
// and the privacy policy links here. The steps name the app's own labels
// through their translation keys, so they can't drift from the screens.
"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/use-locale";
import { LegalBackArrow } from "@/components/legal-back-arrow";

const CONTACT_EMAIL = "hello@linette.app";

export default function DeleteAccountPage() {
  const { t } = useLocale();
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      <LegalBackArrow />
      <h1 className="font-[family-name:var(--font-heading)] text-3xl mb-2">
        {t("deleteAccount.title")}
      </h1>
      <p className="text-muted-foreground mb-8">{t("deleteAccount.intro")}</p>

      <h2 className="font-semibold text-lg mt-8 mb-3">{t("deleteAccount.selfTitle")}</h2>
      <ol className="list-decimal pl-5 space-y-2 mb-4">
        <li>{t("deleteAccount.step1")}</li>
        <li>
          {t("deleteAccount.step2", {
            profile: t("nav.profile"),
            accountSecurity: t("profile.privacyAndData"),
          })}
        </li>
        <li>{t("deleteAccount.step3", { deleteAccount: t("profile.deleteAccount") })}</li>
      </ol>
      <p className="mb-4">{t("deleteAccount.selfNote")}</p>
      <Link
        href="/profile/settings/privacy"
        className="tap-h inline-flex items-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
      >
        {t("deleteAccount.openSettings")}
      </Link>

      <h2 className="font-semibold text-lg mt-10 mb-3">{t("deleteAccount.askTitle")}</h2>
      <p className="mb-6">{t("deleteAccount.askBody", { email: CONTACT_EMAIL })}</p>

      <h2 className="font-semibold text-lg mt-8 mb-3">{t("deleteAccount.deletedTitle")}</h2>
      <ul className="list-disc pl-5 space-y-2 mb-6">
        <li>{t("deleteAccount.deletedAccount")}</li>
        <li>{t("deleteAccount.deletedWardrobe")}</li>
        <li>{t("deleteAccount.deletedOutfits")}</li>
        <li>{t("deleteAccount.deletedPreferences")}</li>
        <li>{t("deleteAccount.deletedSubscription")}</li>
      </ul>

      <h2 className="font-semibold text-lg mt-8 mb-3">{t("deleteAccount.keptTitle")}</h2>
      <ul className="list-disc pl-5 space-y-2 mb-6">
        <li>{t("deleteAccount.keptPayments")}</li>
        <li>{t("deleteAccount.keptSupport")}</li>
        <li>{t("deleteAccount.keptLogs")}</li>
        <li>{t("deleteAccount.keptBackups")}</li>
      </ul>

      <h2 className="font-semibold text-lg mt-8 mb-3">{t("deleteAccount.playTitle")}</h2>
      <p className="mb-6">{t("deleteAccount.playBody")}</p>

      <h2 className="font-semibold text-lg mt-8 mb-3">{t("deleteAccount.partTitle")}</h2>
      <p className="mb-6">{t("deleteAccount.partBody")}</p>

      <div className="mt-12 flex gap-6 text-sm [&>a]:inline-flex [&>a]:items-center [&>a]:tap-h">
        <Link href="/privacy" className="underline">
          {t("launch.privacy")}
        </Link>
        <Link href="/terms" className="underline">
          {t("launch.terms")}
        </Link>
      </div>
    </div>
  );
}
