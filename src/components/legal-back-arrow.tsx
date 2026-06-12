"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";

// Escape hatch for the legal pages: they hide the bottom nav, so the
// only exit used to be a mislabeled footer link (audit P1 navigation
// trap). Falls back to home on direct visits with no history — signed-
// out visitors are routed to /login from there, which is the right
// landing anyway.
export function LegalBackArrow() {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      aria-label={t("common.back")}
      className="inline-flex h-11 w-11 -ml-2 mb-4 items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
