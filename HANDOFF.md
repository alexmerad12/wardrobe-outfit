# HANDOFF — Linette (Wardrobe Outfit)

## Project
Linette — AI wardrobe-styling PWA (Next.js 16 / Supabase / Vercel / Gemini). Owner's own product (9537-1076 Québec Inc.), not a client project. Production: https://linette.app.

## STATUS 2026-10-15 — modernization pass, read first
Committed locally, NOT pushed (pushing to `main` deploys production; the owner approves the push).

**Blocker, owner action: Gemini billing is inactive.** The AI Studio project behind `GOOGLE_API_KEY` is on the free tier: 20 requests per model per day. Production shares that key, so live AI features (suggest, try-on, analyze, packing) stop after 20 calls a day. Reactivate billing in AI Studio / Google Cloud billing, then run the two checks below on `gemini-3.6-flash`.

What changed:
- **Supabase restored** on the free plan. `vercel.json` adds a daily cron on `/api/cron/keepalive` (one-row read, `CRON_SECRET` bearer) so the 7-day idle pause can't happen again once deployed. Functions move to `pdx1`, next to the database in us-west-2 (production ran in `iad1`).
- **Background removal self-hosted** (Photoroom was cancelled): BiRefNet-lite ONNX in `/api/items/normalize`, 98% mean mask IoU against Photoroom on real wardrobe photos, catalog framing (1280×1280 white, 8% padding). Privacy pages (EN/FR) no longer name Photoroom, effective date October 15, 2026. `PHOTOROOM_API_KEY` is now unused in Vercel.
- **Models** (`src/lib/gemini.ts`): quality `gemini-3.6-flash` (suggest, refine, try-on simulation), fast `gemini-3.5-flash-lite` (analyze, try-on item read, packing). `GEMINI_QUALITY_MODEL` overrides the quality model without a deploy. `gemini-3.8-flash` answered only 503/429 for this project: re-probe before switching.
- **Dependencies**: Next 16.4.1, React 19.3.1, supabase-js 2.118, @supabase/ssr 0.12.7, Sentry 10.76, Stripe 22.6, @google/genai 2.30, ESLint 10, Playwright 1.64, Tailwind 4.3. `@vercel/kv` → `@upstash/redis`. Removed unused: imgly, anthropic, openai, old google SDK, @vercel/blob, node-vibrant, tus-js-client. Held back on purpose: Stripe 23 (API version), Sentry 11 (privacy defaults), TypeScript 7, sharp 0.35.
- **Security**: `ai_calls` insert policy now `auth.uid() = user_id` (APPLIED to production, `supabase-migration-ai-call-insert-policy.sql`). Photo paths must sit in the caller's own storage folder, the server never fetches an arbitrary URL. Cap/paywall bypass needs a confirmed email. Weather responses are CDN-cacheable only for GPS lookups.
- **Billing**: webhook re-reads the live subscription, no second subscription or repeat trial at checkout, account deletion cancels any billable subscription first (and refuses to delete if Stripe fails).
- **API robustness**: bad JSON → 400 everywhere, database input errors → 400 (`dbErrorResponse`), date validation on today/packing, refunds on every AI failure path.
- **Styling rules** (`src/app/api/suggest/route.ts` + `src/lib/suggest-prompt.ts`), fixed where the code contradicted its own prompt:
  - one belt predicate for strip, injector and completer: no more "strip the belt, then demand it"; a wrap dress's tie counts as the belt;
  - men's track: no injected bag, only a belt injected and only with a tucked shirt, slim trousers keep their belt, no tights advice, jeans allowed at work (as its prompt says);
  - weather: no coats shown at ≥25°C, no sandals injected or shipped below 14°C when a closed shoe exists, no wool scarf injected on a hot day, runs-hot/runs-cold move the outerwear line (9°C / 15°C);
  - bags: injector respects backpack/material/size rules; clutch/small size only enforced when the user owns one (users with only medium bags got empty results at date/party/formal);
  - hats at formal: dressy women's shapes (pillbox, headband, beret) allowed, as the prompt's own formal list said;
  - sneakers at work: Track A bans only athletic ones (formality below smart-casual); men's track bans all;
  - tights tips: never on trousers or shorts, never at home.

Verification (local dev server, dedicated test account `e2e-audit-claude@linette.app`, signed in through the admin API, no password):
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: clean.
- Endpoint sweep: every non-AI endpoint passes, plus normalize (bg removed, 1280×1280), analyze and packing (FR). suggest / refine / try-on were blocked by the free-tier cap on 3.6, not by code.
- `npm run test:rules`: 8/8 on the new code, run through `GEMINI_QUALITY_MODEL` (6 on gemini-2.5-flash, 2 on gemini-2.5-flash-lite) because 3.6's free quota was spent. Includes new tests: wrap dress, men's track, hot weather (Dubai 31°C), cold weather (Iqaluit 0°C).

Still to verify after billing is back: `npm run test:rules` on 3.6, the AI stress specs, suggest/refine/try-on in the live sweep.

## Earlier status (2026-10-09 audit, still true)
- **Apple developer-name trap:** the name under the app title can be "Linette" only if Linette is a registered trade name of 9537-1076 (Quebec "déclaration de mise à jour courante", free), and it can ONLY be set when the first app record is created, never changed after. Otherwise it shows "9537-1076 Québec inc." forever. Decide before creating the app in App Store Connect. Seller always shows the legal name. Google Play publicly shows legal name + address + developer email + phone.
- Stripe live, webhook enabled, no real subscribers yet. Auth emails go through Resend SMTP.
- Store blockers (none built yet): Capacitor shell, IAP via RevenueCat + Restore Purchases, Sign in with Apple + native Google sign-in (Google blocks OAuth in WebViews), Gemini consent screen (Apple 5.1.2(i)), report button on AI output (Play AI policy), 18+ age gate + terms (Gemini API terms require 18+, terms say 13+), public account-deletion URL (Play), demo account with entitlement for reviewers, Mac/Xcode 26 for iOS builds.
- **Entity DECIDED (2026-10-14): stays 9537-1076 Québec inc. + DUNS 243370174, no restructure.** Stripe, legal pages and the existing Play Console signup stay as they are. Copy the legal name and address EXACTLY as Apple's D-U-N-S lookup shows them (accents and unit number included): store and SMS registrations reject spelling mismatches.

## Key paths
- Subscription gate: `src/lib/subscription.ts` (grandfather cutoff), `src/lib/require-subscription.ts` (API 402 gate), `src/lib/supabase/proxy.ts` (middleware page gate + PUBLIC_PATHS)
- Stripe: `src/app/api/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/billing-portal/route.ts`, `src/lib/stripe.ts`
- AI: `src/lib/gemini.ts` (models), `src/lib/gemini-retry.ts`, `src/lib/daily-cap.ts`, `src/lib/log-ai-call.ts`
- Background removal: `src/lib/cutout/` (model, matte, pipeline), `src/app/api/items/normalize/route.ts`, `src/lib/owned-photo.ts`
- Suggest rules: `src/app/api/suggest/route.ts` (shared predicates hoisted above `buildOutfit`), `src/lib/suggest-prompt.ts`, harness `tests/e2e/rule-compliance.spec.ts`
- Env: `.env.local.example` lists every variable the code reads. DNS on Vercel (`npx vercel dns ls linette.app`). On this machine the Vercel CLI needs `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Gotchas
- **Next.js ignores `instrumentation.ts` at repo root when `src/` exists** → Sentry silently captured nothing for 43 days. Files must live in `src/`.
- **Env vars that exist locally but not on Vercel fail silently in prod.** Preview has no Supabase, Google or KV vars: a CLI preview deploy needs them passed with `--env` / `--build-env`.
- **A CLI deploy uploads gitignored files** except a short default list (`.env.local` is excluded, `src/app/logo-lab/` and `.claude/` are not). Deploy previews from a clean `git archive` of a commit.
- **Gemini free tier is 20 requests per model per day, per project, shared with production.** Testing on the production key spends production's quota.
- **Flash-Lite rejects `thinkingBudget`** (400): it takes `thinkingLevel`.
- **Supabase: new tables in `public` created after 2026-10-30 need explicit GRANTs** to anon/authenticated. Any table added for the store build must ship its GRANT in the migration.
- **Stripe checkout `customer_creation`/`customer_update` are payment-mode only** — passing them in subscription mode = 500.
- **Cancelling a *trialing* sub via Customer Portal sets `cancel_at`, not `cancel_at_period_end`** — webhook maps either to the DB flag.
- `lottie-react` has no `speed` prop — set via `lottieRef.current.setSpeed()` in `onDOMLoaded`.

## Next steps (ordered)
0. Owner: reactivate Gemini billing. Then `npm run test:rules` (HARNESS_EMAIL + CAP_BYPASS_EMAILS, see CLAUDE.md) and the AI stress specs on 3.6.
1. Owner approves the push → deploy → verify on production: normalize on Linux (cold start, timing, memory), keepalive cron firing, suggest end to end. `CRON_SECRET` must be in Vercel production before the cron's first run.
2. Owner decisions on the styling-rule taste calls (belt on shift dresses and slim bottoms, mini skirt → boots, mandatory statement piece, metal-sync strictness, Cozy palette neutrals, casual heels, bodycon at work, sandals with wide-leg trousers).
3. Optional cleanup: unused Vercel env vars (`PHOTOROOM_API_KEY`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `KV_URL`, `KV_REST_API_READ_ONLY_TOKEN`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
4. Store accounts (owner): resume Play Console, enroll Apple, both under 9537-1076 / DUNS 243370174.
5. Web-side compliance (ships to linette.app too): Gemini consent screen, report button on AI output, 18+ terms + age gate, public account-deletion page, email confirm ON, private bucket + signed URLs.
6. Store build: Capacitor scaffold → Sign in with Apple + native Google sign-in → RevenueCat + platform-aware paywall → Restore Purchases (i18n key `paywall.restore` exists) → demo reviewer account → listings. iOS builds need a Mac / Xcode 26.
7. OTP login as default email auth (before native wrap).
8. Marketing/launch-announcement plan — never started.
