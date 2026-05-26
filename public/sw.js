// Minimal service worker — its only job is to exist with a fetch
// handler so Chrome considers the app "installable" and shows the
// proper "Install app" prompt instead of the lower-tier "Add to
// Home Screen" fallback.
//
// Deliberately does NOT cache anything: caching introduces a whole
// class of staleness bugs (users seeing old UI after a deploy,
// hot-reload not working in dev, API responses pinned to disk) that
// a wardrobe / suggest app doesn't need. The PWA install benefit is
// independent of offline caching — if we ever want offline support
// later we add it here; today we just pass every request through.

self.addEventListener("install", () => {
  // Activate immediately on first install / update — no "waiting"
  // limbo where a new SW sits idle until every tab closes.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of open tabs right away so the registration is
  // active without a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op fetch handler. The HANDLER ITSELF is what Chrome checks
  // for when deciding installability — its behavior doesn't matter,
  // only that it exists. Returning nothing means "let the browser
  // handle the request normally" — full network behaviour preserved.
});
