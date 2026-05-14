// Sentry server + edge runtime init.
//
// Next.js calls `register()` once on cold start of each runtime
// (Node.js and Edge). We branch on NEXT_RUNTIME so the Node-only
// integrations don't try to load in the Edge worker (Vercel Edge runs
// a different JS engine without Node APIs).
//
// `onRequestError` is the hook Next.js calls for any uncaught error
// thrown inside a route handler / server action / RSC — Sentry uses
// it to capture errors with proper request context (URL, method, etc).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // 100% sample rate is fine pre-launch (low traffic). Dial down
      // to 0.1 (10%) once we have enough traffic to risk hitting
      // Sentry's free-tier monthly transaction quota.
      tracesSampleRate: 1.0,
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 1.0,
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
