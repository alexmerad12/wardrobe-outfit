"use client";

import { useEffect } from "react";
import { barStyleFor, drawsUnderSystemBars, shellPlugins, type BarStyle } from "@/lib/native-shell";
import { appAuthReturnPath } from "@/lib/app-google-sign-in";

// The last return link from Google's sign-in sent on to /auth/callback.
const SIGN_IN_RETURN_KEY = "linette_sign_in_return";

/**
 * What the site does for the Android app (src/lib/native-shell.ts). It
 * renders nothing, and in a browser it does nothing.
 *
 * - Back: Android's back button or gesture goes back one page, and at the
 *   first page it puts the app in the background. Without this listener
 *   the first page ignores Back and the app can't be left with it.
 * - System bars: the clock and the icons need the colour that contrasts
 *   with what is behind them. On a current WebView (140+) that is the
 *   page itself, which draws under the bars: light icons on the black
 *   launch splash and on a dark page, dark icons otherwise. The page's
 *   mode is the .dark class on <html> (Settings → Appearance can differ
 *   from the phone). On an older WebView the page is padded away from
 *   the bars and the strip behind them has the phone's own colour, so
 *   the phone's mode decides. Capacitor works the icons out once, at
 *   start: left alone they stayed dark when the phone switched to dark
 *   with the app open (seen on the Android 15 emulator, 2026-11-13).
 * - Google's sign-in: the return link from its Chrome tab
 *   (app.linette://auth/callback) goes on to the site's /auth/callback.
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

    // Back from Google's sign-in in a Chrome tab (src/lib/app-google-sign-in.ts):
    // the site finishes it on its own /auth/callback. A link that started the
    // app (when Android had closed it meanwhile) comes through getLaunchUrl,
    // which keeps answering with it on every page: its code works once, so a
    // link already sent on isn't sent again.
    const finishSignIn = (link?: string) => {
      const path = appAuthReturnPath(link);
      if (!path || !link) return;
      try {
        if (sessionStorage.getItem(SIGN_IN_RETURN_KEY) === link) return;
        sessionStorage.setItem(SIGN_IN_RETURN_KEY, link);
      } catch {}
      window.location.assign(path);
    };
    if (app?.addListener) {
      const handle = app.addListener("appUrlOpen", ({ url }) => finishSignIn(url));
      cleanups.push(() => {
        void Promise.resolve(handle)
          .then((listener) => listener?.remove?.())
          .catch(() => {});
      });
    }
    if (app?.getLaunchUrl) {
      void app
        .getLaunchUrl()
        .then((launch) => finishSignIn(launch?.url))
        .catch(() => {});
    }

    const setStyle = plugins.SystemBars?.setStyle;
    if (setStyle) {
      const root = document.documentElement;
      const underBars = drawsUnderSystemBars(navigator.userAgent);
      const phoneDark = window.matchMedia("(prefers-color-scheme: dark)");
      let current: BarStyle | null = null;
      const sync = () => {
        const splash =
          underBars && !root.classList.contains("skip-splash") && document.querySelector(".launch-splash") !== null;
        const dark = underBars ? root.classList.contains("dark") : phoneDark.matches;
        const style = barStyleFor({ dark, splash });
        if (style === current) return;
        current = style;
        void setStyle({ style }).catch(() => {});
      };
      // The page's mode changes through the class on <html>; the splash is
      // a direct child of <body> that React removes when it ends.
      const observer = new MutationObserver(sync);
      if (underBars) {
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        observer.observe(document.body, { childList: true });
      }
      phoneDark.addEventListener("change", sync);
      sync();
      cleanups.push(() => {
        observer.disconnect();
        phoneDark.removeEventListener("change", sync);
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
