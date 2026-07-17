# HANDOFF — Linette (Wardrobe Outfit)

## Project
Linette — AI wardrobe-styling PWA (Next.js 16 / Supabase / Vercel / Gemini). Owner's own product (9537-1076 Québec Inc.), not a client project. Production: https://linette.app.

## Current state — LAUNCH-READY
Everything pre-launch is done and verified live:
- **Stripe paywall live**: $6.99/wk (7-day trial, card required) + $59.99/yr, hard gate after onboarding. Checkout → webhook → `user_subscriptions` → access verified end-to-end with a real card (July 8 test). Beta users created before `2026-06-12T00:00:00Z` are grandfathered free forever (`PAYWALL_LIVE_AT_MS` in `src/lib/subscription.ts`).
- **Stripe dashboard configured**: receipts, recovery emails, smart retries (cancel on exhaust), public details (Linette / hello@linette.app / LINETTE.APP descriptor), branding (icon + white header + black accent).
- **Sentry actually works now** (was dead 43 days — see Gotchas).
- **Email migrated to Google Workspace (2026-07-17)**: hello@linette.app is a real inbox + admin login; MX `smtp.google.com`, SPF/DKIM/DMARC all live on Vercel DNS; sender name "Linette" via Gmail send-as. ImprovMX decommissioned (account cancellation still pending, harmless).
- **Feedback form fixed**: `RESEND_API_KEY` was never on Vercel → 5xx in prod since shipping. Added (prod+preview) + redeployed + verified delivery.

## In progress
Nothing mid-flight. Next chapter is stores (below).

## Open items
- **Test-trial revocation check**: trial for test account `shhe@gmail.com` (pw `linette-trial-check-2026`, Supabase user `9f6e0e3f-...c56c`) expired ~Jul 15. Log in → should land on `/paywall`. Verifies access revocation, the one unobserved lifecycle link. Server-side check: `user_subscriptions.status` should be `canceled`.
- **Store accounts** (user's task): DUNS `243370174` assigned 2026-07-15. Open Play Console ($25, owner = hello@linette.app) + Apple Developer ($99/yr, same identity). Apple may not find a fresh DUNS for ~2 wks — retry, never re-apply.
- **User may cancel ImprovMX** account (dead weight).

## Key paths
- Subscription gate: `src/lib/subscription.ts` (grandfather cutoff), `src/lib/require-subscription.ts` (API 402 gate), `src/lib/supabase/proxy.ts` (middleware page gate + PUBLIC_PATHS)
- Stripe: `src/app/api/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/billing-portal/route.ts`, `src/lib/stripe.ts`
- Paywall UI: `src/app/paywall/page.tsx` (+ `/success`); billing card in `src/app/profile/settings/page.tsx`
- Env: `.env.local` ↔ Vercel (all Stripe vars + RESEND_API_KEY now synced). Stripe webhook endpoint: `https://linette.app/api/stripe/webhook`.
- DNS: all on Vercel (`npx vercel dns ls linette.app`); Vercel CLI is authed — TLS quirk: prefix `NODE_TLS_REJECT_UNAUTHORIZED=0` and curl needs `--ssl-no-revoke` on this machine.

## Gotchas (burned time this session)
- **Next.js ignores `instrumentation.ts` at repo root when `src/` exists** → Sentry silently captured nothing for 43 days (captureException returns an event ID even with no SDK init). Files must live in `src/`. Documented in CLAUDE.md.
- **Env vars that exist locally but not on Vercel fail silently in prod** (Sentry DSN was fine, RESEND_API_KEY wasn't). TODO next session: full `.env.local` vs `vercel env ls` audit.
- **Stripe checkout `customer_creation`/`customer_update` are payment-mode only** — passing them in subscription mode = 500.
- **Cancelling a *trialing* sub via Customer Portal sets `cancel_at`, not `cancel_at_period_end`** — webhook maps either to the DB flag.
- `lottie-react` has no `speed` prop — set via `lottieRef.current.setSpeed()` in `onDOMLoaded`.

## Next steps (ordered)
1. Verify trial-revocation (shhe@gmail.com → `/paywall`), then delete that test row + Stripe customer.
2. Env-var audit: `.env.local` vs Vercel, all three environments.
3. Supabase auth emails → Resend custom SMTP (deliverability for forgot-password; prereq for OTP).
4. Store build once accounts exist: Capacitor scaffold → Sign in with Apple (required, we offer Google) → RevenueCat + platform-aware paywall (web=Stripe, iOS=IAP, Android=Play Billing) → Restore Purchases button (i18n key `paywall.restore` already exists) → store listings.
5. OTP login as default email auth (after #3; before native wrap).
6. Marketing/launch-announcement plan ("first hundred strangers") — never started.
