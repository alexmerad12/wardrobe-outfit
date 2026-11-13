"use client";

import { useEffect } from "react";
import { barStyleFor, drawsUnderSystemBars, shellPlugins, type BarStyle } from "@/lib/native-shell";

/**
 * What the site does for the Android app (src/lib/native-shell.ts). It
 * renders nothing, and in a browser it does nothing.
 *
 * - Back: Android's back button or gesture goes back one page, and at the
 *   first page it puts the app in the background. Without this listener
 *   the first page ignores Back and the app can't be left with it.
 * - System bars: the page draws under the status bar, so the clock and
 *   the icons need the colour that contrasts with the page: light on the
 *   black launch splash and in dark mode, dark otherwise. The page's mode
 *   is the .dark class on <html> (Settings → Appearance can differ from
 *   the phone), so this follows that class, not the phone.
 */
export function NativeShell() {
  useEffect(() => {
    const plugins = shellPlugins();
    if (!plugins) return;
    const cleanups: Array<() => void> = [];

    const app = plugins.App;
    if (app?.addListener) {
      const handle = app.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        const leave = app.minimizeApp ?? app.exitApp;
        if (leave) void leave().catch(() => {});
      });
      cleanups.push(() => {
        void Promise.resolve(handle)
          .then((listener) => listener?.remove?.())
          .catch(() => {});
      });
    }

    const setStyle = plugins.SystemBars?.setStyle;
    if (setStyle && drawsUnderSystemBars(navigator.userAgent)) {
      const root = document.documentElement;
      let current: BarStyle | null = null;
      const sync = () => {
        const splash =
          !root.classList.contains("skip-splash") && document.querySelector(".launch-splash") !== null;
        const style = barStyleFor({ dark: root.classList.contains("dark"), splash });
        if (style === current) return;
        current = style;
        void setStyle({ style }).catch(() => {});
      };
      // The mode changes through the class on <html>; the splash is a
      // direct child of <body> that React removes when it ends.
      const observer = new MutationObserver(sync);
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      observer.observe(document.body, { childList: true });
      sync();
      cleanups.push(() => observer.disconnect());
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
