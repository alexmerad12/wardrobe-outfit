import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a thin native shell around the live site: it loads
// https://linette.app in the phone's WebView, so a web deploy updates the
// app at once and nothing of the app itself is bundled here. The plan, the
// versions and what was checked: docs/android-shell-plan.md.
//
// - appId is the Play Store package name: permanent once a build is
//   uploaded.
// - server.url must be the apex (www redirects, and a redirect to another
//   host is thrown to the outside browser). Leave allowNavigation empty:
//   every host listed there would also get the native bridge.
// - native-shell/ only has to exist for the CLI. Nothing in it is shown
//   except offline.html, when the site can't be reached.
// - The user agent suffix lets the site know it runs inside the app.
const config: CapacitorConfig = {
  appId: "app.linette",
  appName: "Linette",
  webDir: "native-shell",
  server: {
    url: "https://linette.app",
    errorPath: "offline.html",
  },
  android: {
    appendUserAgent: "LinetteAndroid/1",
    // What the WebView shows before the first page has drawn: the black
    // of the launch screens on both sides of it (the system's, then the
    // site's own), so a launch never flashes white.
    backgroundColor: "#000000",
  },
  plugins: {
    // Edge to edge is mandatory when targeting Android 16 (API 36). The
    // site already sets viewport-fit=cover and pads with env(safe-area-*).
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DEFAULT",
    },
  },
};

export default config;
