import type { NextConfig } from "next";
// The /config entry point: importing withSentryConfig from the package
// root is deprecated in @sentry/nextjs 10.x and removed in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

// onnxruntime-node (self-hosted background removal, src/lib/cutout) ships
// prebuilt binaries for every OS in one ~300 MB package. Keep it out of the
// bundler, trace exactly the two Linux x64 files the Vercel function loads
// (the binding is required through a platform-computed path that file
// tracing can't follow, and libonnxruntime.so is loaded by the OS linker),
// and drop every other platform so the function stays under 250 MB.
const ORT_BIN = "./node_modules/onnxruntime-node/bin/napi-v6";

const nextConfig: NextConfig = {
  // React Compiler (stable in Next 16, babel-plugin-react-compiler 1.0):
  // memoizes components automatically, fewer re-renders on low-end
  // phones. The code passes eslint-config-next's compiler-backed
  // react-hooks rules, which flag the patterns it can't compile.
  reactCompiler: true,
  serverExternalPackages: ["onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/items/normalize": [
      `${ORT_BIN}/linux/x64/onnxruntime_binding.node`,
      `${ORT_BIN}/linux/x64/libonnxruntime.so.1`,
    ],
  },
  outputFileTracingExcludes: Object.fromEntries(
    // "/*" per the Next docs for all routes, plus the one route that
    // actually loads the runtime, explicitly.
    ["/*", "/api/items/normalize"].map((route) => [
      route,
      [
        `${ORT_BIN}/win32/**/*`,
        `${ORT_BIN}/darwin/**/*`,
        `${ORT_BIN}/linux/arm64/**/*`,
        `${ORT_BIN}/linux/x64/libonnxruntime_providers_*`,
      ],
    ])
  ),
  // Baseline security headers on every response (Vercel already sends
  // HSTS). No script / style CSP on purpose: Next's inline bootstrap
  // scripts, the Sentry tunnel, Supabase, Stripe redirects and blob:
  // photo previews would all need allowances, and a wrong CSP blanks
  // pages. These directives block framing (clickjacking), plugins and
  // <base> hijacking only. Geolocation stays allowed for this origin: the
  // weather widget, onboarding and settings ask for the device position.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
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
      // The v11 build plugin reports its own usage to Sentry by default
      // ("Sending telemetry data on issues and performance"). Not app
      // data, but off, in line with the dataCollection baseline.
      telemetry: false,
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
