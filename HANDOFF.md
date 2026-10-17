# HANDOFF — Linette (Wardrobe Outfit)

## Project
Linette: AI wardrobe-styling PWA (Next.js 16 / Supabase / Vercel / Gemini), the owner's own product (9537-1076 Québec Inc.), not a client project. Production: https://linette.app. Architecture and conventions: `CLAUDE.md`. Every confirmed root cause and ruled-out theory: `known-root-causes.md`. Launch checklist: `PRE-LAUNCH.md`.

## Current state (2026-10-17)
- **The modernization goal is CLOSED:** the owner rated the app 10/10 on 2026-10-17 (endpoints, models, styling rules, background removal). Code as of ec11e9f; later commits are docs only.
- **Last full production check** (2026-10-17 ~1:45 PM EDT, deployment 37ec2ce): endpoint sweep 61/61, background removal included (25-37 s a photo end to end) and the keepalive's authorized path (200 through `vercel crons run`); UI smoke 9/9 tabs with 0 console errors; 0 error-level logs and 0 5xx after the deploy. Docs deploys after it were smoke-tested (pages, auth gates, logs).
- **Models** (`src/lib/gemini.ts`): outfits (suggest, refine, try-on simulation) on `gemini-3.6-flash` at thinking level LOW, falling back to `gemini-3.5-flash-lite`; photo tagging, packing and try-on's photo read on `gemini-3.5-flash-lite`, falling back to 3.6. Google billing on (Tier 1, prepaid, auto-reload).
- **Background removal:** self-hosted BiRefNet-lite (our lean ONNX export, in Vercel Blob) with the mirror pass, one whole photo at a time per instance. A 5-photo bulk upload takes ~110 s (109 s measured, Pixel 10 profile on 4G).
- **Styling rules:** the owner's 8 decisions are live (below). Five are pure functions in `src/lib/outfit-rules.ts`, shared by the validator, the injectors and the fallback gate.
- **Infra:** Vercel functions in `pdx1` on the Performance size (2 vCPU / 4 GB, project-wide). Supabase free plan in us-west-2, kept awake by the daily `/api/cron/keepalive` (09:17 UTC). Upstash KV holds the daily caps. Stripe live (webhook on, no real subscribers yet). Auth emails through Resend SMTP. Sentry with the explicit privacy baseline.
- **Tests:** `npm run test:unit` 63 tests in 9 files. `npm run test:rules` 8/8 (needs a local server with the e2e email in `CAP_BYPASS_EMAILS`). CI (typecheck on TypeScript 6 and 7, lint, unit tests) green on every push.

## Owner decisions (don't reopen)
- Gemini only: "remodernize with Claude Opus 5.5" meant modernizing the code with Claude, not Claude models in the app (2026-10-16).
- The real-phone upload batch is skipped, the emulated phone runs are accepted. His phone is a Pixel 10, not a 4 GB phone (2026-10-16).
- Vercel Performance size on (2026-10-17). To switch back: `PATCH /v9/projects/<project id>` with `resourceConfig.functionDefaultMemoryType: "standard"`, then redeploy. Keep any model's peak under 2 GB so that stays safe.
- Background removal signed off with the mirror pass after a side-by-side with Photoroom on 12 of his photos (2026-10-17). Accepted limit: on white clothes against a white door, a door patch or a wall hook can stay.
- The 8 styling-rule taste calls (2026-10-17), each the sourced recommendation:
  - belts optional, never required, on shift dresses and slim bottoms;
  - shoes follow the hem: mini → flats, sneakers or ankle boots (tall boots still fine in the cold);
  - mid heels fine at casual and brunch, high heels never there;
  - heeled, wedge or platform sandals fine with full wide-leg trousers, flat sandals not;
  - no statement piece needed at work or formal, and a clear light/dark contrast counts elsewhere;
  - metals: one main metal on 2+ pieces plus one accent is fine;
  - Cozy: beige, tan, camel, brown and khaki are neutrals; a clash needs a strong warm and a strong cool colour (judged by hex);
  - bodycon at work only as a neutral midi or maxi under a blazer or cardigan.
- Entity stays 9537-1076 Québec inc. + DUNS 243370174, no restructure (2026-10-14).

## In progress
Nothing mid-flight.

## Open issues / pending decisions
- **Owner, before public launch** (`PRE-LAUNCH.md`): open Google signup (`INVITE_ONLY=false` in Vercel; unset keeps the invite gate on), photo bucket private + signed URLs (audit A7), email confirmation ON in Supabase, Google OAuth verification.
- **Owner, before creating the App Store record:** the Apple developer name (`PRE-LAUNCH.md`, Mobile).
- Optional: one 5-photo upload from the owner's Pixel 10 (TASKS.md).
- Dev tooling only: `npm audit` reports 9 "high" through braces ≤3.0.3 (GHSA-vfj7-8cjw-p6xm) in the shadcn CLI and ESLint's Next plugin; no patched braces exists yet. Runtime dependencies: 0 findings.
- TypeScript 7 waits on typescript-eslint (declares `<6.1.0`); CI already type-checks the code with TypeScript 7.
- Cleanup: unused Vercel env vars (`PHOTOROOM_API_KEY`, `ANTHROPIC_API_KEY`, `KV_URL`, `KV_REST_API_READ_ONLY_TOKEN`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; keep `BLOB_READ_WRITE_TOKEN`, it uploads the model) and the old Blob photos (`PRE-LAUNCH.md`, Data hygiene: 10 real items still point at them).

## Key paths
- AI: `src/lib/gemini.ts` (model IDs + thinking), `src/lib/gemini-retry.ts`, `src/lib/daily-cap.ts`, `src/lib/log-ai-call.ts`
- Outfit rules: `src/app/api/suggest/route.ts` (shared predicates above `buildOutfit`), `src/lib/outfit-rules.ts` (the owner-decided rules), `src/lib/suggest-prompt.ts`, harness `tests/e2e/rule-compliance.spec.ts`
- Background removal: `src/lib/cutout/` (`model.ts`, `matte.ts` with the mirror pass, `index.ts`, `one-at-a-time.ts`), `src/app/api/items/normalize/route.ts`, `src/lib/owned-photo.ts`
- Billing: `src/app/api/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/billing-portal/route.ts`, `src/lib/subscription.ts`, `src/lib/require-subscription.ts`, `src/lib/supabase/proxy.ts`
- Tests: `src/**/*.test.ts` (Vitest), `tests/e2e/` (Playwright, signs in only as an account with "e2e" or "harness" in its email)
- Env: `.env.local.example` lists every variable the code reads. DNS on Vercel (`npx vercel dns ls linette.app`). On this machine the Vercel CLI needs `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Gotchas
- Fluid compute can put one user's concurrent requests on one instance (the same bulk upload landed on one, two, then one instance): CPU-heavy work must queue whole jobs per instance. In-function concurrency and the memory/CPU size are project-wide switches, not per function.
- Model memory, not size, is the Vercel limit: measure peak RSS (`process.resourceUsage().maxRSS`; a 10 ms sampler misses the spike) before shipping any ONNX model.
- `CRON_SECRET` is a sensitive (write-only) Vercel variable: test the keepalive's authorized path with `vercel crons run /api/cron/keepalive` and read the 200 in `vercel logs`.
- `?debug=rules` and the cap bypass need the e2e email in `CAP_BYPASS_EMAILS`: true on a local server started with it, not on production, where the test account's caps apply (suggest 3 a day).
- Env vars that exist locally but not on Vercel fail silently in prod. Preview has no Supabase, Google or KV vars: a CLI preview needs them passed with `--env` / `--build-env`, and should come from a clean `git archive` (a CLI deploy uploads gitignored files except a short default list).
- Gemini free tier: 20 requests per model per day per project, shared with production, reset at midnight Pacific, and Google may use free-tier traffic. If AI Studio shows "Account inactive", reopen the Cloud billing account (a declined card closes it).
- `vercel curl` created a deployment-protection bypass token (Settings → Deployment Protection); revoke it there if unwanted.
- Supabase: new `public` tables created after 2026-10-30 need explicit GRANTs to anon/authenticated in their migration.
- After a context compaction, the re-read instruction files can show stale copies of CLAUDE.md and memory: check disk and git before "fixing" a revert (it happened twice, nothing had reverted).

## Next steps (ordered)
1. Store accounts (owner): resume Play Console, enroll Apple, both under 9537-1076 / DUNS 243370174.
2. Web-side compliance (ships to linette.app too): Gemini consent screen, report button on AI output, 18+ terms + age gate, public account-deletion page, email confirmation ON, private photo bucket + signed URLs.
3. Store build: Capacitor scaffold → Sign in with Apple + native Google sign-in → RevenueCat + platform-aware paywall → Restore Purchases (i18n key `paywall.restore` exists) → reviewer demo account → listings. iOS builds need a Mac with Xcode 26.
4. OTP codes as the default email login (before the native wrap).
5. The cleanup under "Open issues" (env vars, the 10 Blob photos, then the old Blob store).
6. Marketing / launch-announcement plan, never started.
