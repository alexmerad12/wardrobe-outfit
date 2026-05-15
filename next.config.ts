import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// Wrap with Sentry so the build step uploads source maps (when
// SENTRY_AUTH_TOKEN is present in CI) and instruments the bundle for
// release tracking.
//
// Skipped in dev: the Sentry build plugin tries to walk node_modules
// looking for tailwindcss from the wrong CWD when paired with
// Turbopack, which makes `npm run dev` hang on cold start. Runtime
// error capture still works in dev via the instrumentation files —
// we just lose the build-time tunnel route + sourcemap upload, which
// dev doesn't need.
//
// `disableLogger` / `automaticVercelMonitors` / `hideSourceMaps` were
// removed in @sentry/nextjs v10 — they only worked with webpack, and
// Next.js 16 defaults to Turbopack. The remaining knobs below are the
// ones that still apply.
const isDev = process.env.NODE_ENV === "development";

export default isDev
  ? nextConfig
  : withSentryConfig(nextConfig, {
      org: "linette",
      project: "linette-web",
      // Only print build-time Sentry logs in CI — keeps build output quiet.
      silent: !process.env.CI,
      // Upload a wider set of files for source-map resolution so stack
      // traces from any chunk file are readable.
      widenClientFileUpload: true,
      // Route Sentry's browser SDK traffic through linette.app/monitoring
      // instead of the public *.ingest.sentry.io hostname — bypasses ad
      // blockers that would otherwise drop error reports.
      tunnelRoute: "/monitoring",
      // Delete client source maps after uploading them to Sentry so they
      // aren't publicly served from the static asset bundle.
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
    });
