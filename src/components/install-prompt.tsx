"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/use-locale";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari exposes navigator.standalone; other browsers use display-mode
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const { t } = useLocale();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(true);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  if (installed) return null;

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-background p-2">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{t("install.installClosette")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("install.description")}
          </p>

          {platform === "android" && deferredPrompt && (
            <Button
              size="sm"
              className="mt-3"
              onClick={handleAndroidInstall}
            >
              {t("install.installApp")}
            </Button>
          )}

          {platform === "android" && !deferredPrompt && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("install.androidInstruction")}
            </p>
          )}

          {platform === "ios" && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowIosHint((v) => !v)}
              >
                {t("install.howToInstallIphone")}
              </Button>
              {showIosHint && (
                <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span>1.</span>
                    <span className="flex items-center gap-1">
                      <Share2 className="h-3.5 w-3.5" /> {t("install.iosStep1")}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span>2.</span>
                    <span className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> {t("install.iosStep2")}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span>3.</span>
                    <span>{t("install.iosStep3")}</span>
                  </li>
                </ol>
              )}
            </div>
          )}

          {platform === "desktop" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("install.desktopInstruction")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
