// Sentry browser-side init.
//
// Runs in every visitor's browser session — captures uncaught JS
// errors, unhandled promise rejections, and (with the right
// integrations) navigation traces. The DSN is `NEXT_PUBLIC_` so it
// bundles into the client; this is fine — Sentry DSNs are not
// secrets, they're meant to be public.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
});

// Hook that lets Sentry trace client-side route transitions
// (App Router navigations). Required by @sentry/nextjs >= 9.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
