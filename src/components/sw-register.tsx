"use client";

import { useEffect } from "react";

// Registers public/sw.js on first mount. The SW itself is a no-op
// fetch passthrough — its only job is to exist so Chrome upgrades
// the install prompt from "Add to Home Screen" to "Install app".
//
// Guarded on `navigator.serviceWorker` so the call no-ops in
// browsers / contexts that don't support SW (iOS in-app webviews,
// some older browsers). Also skips localhost in production builds
// is not needed — registration on dev is fine; the SW just passes
// requests through.
export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Don't surface to users — a failed SW registration just means
      // they don't get the upgraded install prompt; the app still
      // works normally.
      console.warn("[sw] registration failed:", err);
    });
  }, []);

  return null;
}
