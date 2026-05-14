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
// release tracking. Locally, with no auth token, the wrap is a no-op
// for source maps but still enables runtime error capture.
//
// `disableLogger` / `automaticVercelMonitors` / `hideSourceMaps` were
// removed in @sentry/nextjs v10 — they only worked with webpack, and
// Next.js 16 defaults to Turbopack. The remaining knobs below are the
// ones that still apply.
export default withSentryConfig(nextConfig, {
  org: "linette",
  project: "linette-web",
  // Only print build-time Sentry logs in CI — keeps `npm run dev` quiet.
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
