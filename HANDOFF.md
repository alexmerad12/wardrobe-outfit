# HANDOFF — Linette (Wardrobe Outfit)

## Project
Linette: AI wardrobe-styling PWA (Next.js 16 / Supabase / Vercel / Gemini), the owner's own product (9537-1076 Québec Inc.), not a client project. Production: https://linette.app. Architecture and conventions: `CLAUDE.md`. Every confirmed root cause and ruled-out theory: `known-root-causes.md`. Launch checklist: `PRE-LAUNCH.md`. The long history this file carried until 2026-11-16: `git log -p HANDOFF.md`.

## Current state (2026-11-17, evening)
- **Live on linette.app:** main, Next.js 16.4.6. Newest app changes, 2026-11-17: the new styling tips (aee3401, next bullet) and, shipped alone that morning, the dressy-fabric note that no longer prints the occasion's key (1f317a0, "For dinner-out, …", `known-root-causes.md`). Before them: the five fixes from the owner's phone check (53aa344, 2026-11-16): text under the phone's bars on full-screen pages, the Style Me loader's icon, piece names cut at two lines, Profile's "0 0" placeholder, empty Favorites chips last.
- **Google Play, internal testing.** Developer account "Linette App" (id 7755196793193147866, owner hello@linette.app), app "Linette: Your AI Stylist" (id 4973024487375594749, package `app.linette`). Version 15 (1.0.0, the Capacitor shell that loads linette.app) is on the internal track and installed on the owner's and his wife's phones (list "Household"; the addresses live only in the private TASKS.md and memory). App content has nothing left: reviewer sign-in (hello+playreview@linette.app, on production's free-access list), IARC rating, target audience 18+, data safety. Listings in EN, fr-CA and fr-FR, each with its own screenshots and feature graphic (`docs/play-store-listing.md`). A web deploy reaches the installed app at once; only native changes need a new build.
- **His phone check of version 15:** no white flash, Back and the camera work, the session survives a swipe-away and a night (his wife's phone, 2026-11-17 morning). His own phone can't sign in: his account was made with Google and the app has no Google button yet (In progress).
- **New styling tips: LIVE since 2026-11-17 ~5:50 PM EST (aee3401, on the owner's "ship tips").** The tip speaks to the person's moment: what they typed in step 2, otherwise the occasion, the mood or the weather. One instruction, `stylingTipVoice`, serves suggest and refine (refine still asked for the old one-line action tip); French adjectives agree with the wearer's gender; `tidyTip` fixes semicolons, the French space before a colon and intensifiers; the last 4 tips (KV `recent-tips:<user>`) keep openings from repeating; step 2's typed line is capped at 300 characters. Measured on a local build with the demo account: the live tips speak to the moment in 0 of 16 answers, the new ones in 39 of 40 with 4 small flaws; rules harness 8/8 and smoke 25/25 on the merged build. On production after the deploy: the Production deployment succeeded, pages 200, `/api/suggest` 400 on bad bodies and 401 signed out, and refine wrote new-voice tips in both languages with the e2e account ("…: you'll look sharp and feel confident for your first date."). Not checked on production: a full Style Me outfit (the e2e account had used its 3 for the day) and Vercel's runtime logs. The sample scripts and results are in that session's scratchpad (`tips/HANDOFF.md`).
- **Test accounts:** e2e-audit-claude@linette.app holds 23 pieces (a copy of the demo wardrobe since 2026-11-16) and the rules harness puts them back after every run. e2e-demo-wardrobe@linette.app is the store screenshots' wardrobe, not on production's free-access list (local servers let it through with `CAP_BYPASS_EMAILS`).

## In progress
- **A full Style Me outfit on production with the new tips** (any day the e2e account has outfits left: `prod-suggest-check.mts` in the tips scratchpad, or one tap in the app).
- **Native Google sign-in in the Android app (next; the owner asked for "Continue with Google").** The plan:
  1. `@capgo/capacitor-social-login` (exact version, made for Capacitor 8) as a dev dependency, `npx cap sync android`, commit the two gradle files (`CLAUDE.md`, Android app).
  2. `/login` gets a shell-only button shown only when `shellPlugins()` finds the plugin, so version 15 keeps its "choose a password" line. `/signup` hides Google on purpose (comment at the top of `src/app/signup/page.tsx`): decide with the owner. Flow: `SocialLogin.initialize({ google: { webClientId, skipAuthOnlyAuthorizationAfterSignIn: true } })`, a random raw nonce and its SHA-256 hex digest, `SocialLogin.login({ provider: "google", options: { nonce: digest } })`, then `supabase.auth.signInWithIdToken({ provider: "google", token: result.idToken, nonce: raw })` (the token sits under `result`).
  3. Supabase's Google provider uses the web client 797306386794-ajhe82g44epuhdks5b49s5c4jo92rq8v.apps.googleusercontent.com with the nonce check ON (read through the Management API, 2026-11-17): pass that web client as `webClientId`, never an Android client.
  4. Google Cloud project 797306386794: one Android OAuth client for `app.linette` per signing certificate: the upload key (SHA-1 54:5C:B6:C0:E4:53:CD:34:6E:5F:B7:3E:63:96:AA:C5:2C:CE:F7:AC) and Google Play's app signing key (Play Console → App integrity). If the consent screen is in Testing, add the testers under Audience → Test users. Changes can take hours to reach phones.
  5. Data safety: add "Name" (Google sign-in hands the name to Supabase). Then a build through `.github/workflows/android.yml`, upload to internal testing, try on both phones.
  - **Blocked on the owner:** which Google account owns project 797306386794, his OK to create the OAuth client (a new credential in his project), and that account's password typed by him. Checked 2026-11-17: Chrome holds four of his Google accounts; the three company ones make Google Cloud re-ask their password, his personal Gmail has no access to the project. The project memory says a Closette-era business Gmail owned a Cloud project named "Closette" (likely this one); it is not signed in to Chrome. The account names are in the private TASKS.md, never here (public repo).

## Open issues / waiting on the owner
- Google sign-in: which account owns the Cloud project, his OK, his password (In progress).
- Google Play billing: his RevenueCat project and a Google Cloud service account, then the phone test in `docs/play-billing.md`. The code is on main, switched off (the app's paywall says subscriptions are unavailable).
- Before the production release: swap the public developer phone (his wife's cell) for a business line (TASKS.md), then the release and Google's review.
- France, Ireland, the UK: GDPR text in the privacy policy (his call, `docs/play-store-listing.md` section 3).
- The store screenshots predate the outfit-piece frames (15c4a0c): retake them with the demo account when convenient (AI calls).
- Before a public launch (`PRE-LAUNCH.md`): email confirmation ON (one real sign-up first), private photo bucket with signed links, Google OAuth branding/verification.
- Sentry, read on 2026-11-19 in his signed-in Chrome (org `linette`, project `linette-web`; a stale redirect shows a "Closette" login page, the direct address `https://linette.sentry.io/issues/` works). The two stray test errors of 2026-11-13 had arrived (LINETTE-WEB-D, 2 events): resolved. Production reports from both sides on SDK 11.12.0: in 24 h, 140 server request spans, 4 Gemini spans (metadata only), 0 spans with a query string, and in 7 days 0 spans with a user id, email, IP or location. No error from a real person in 14 days. The two other open issues were test leftovers and are resolved too, on his "Resolve them" the same day: LINETTE-WEB-B (10 events, a local build on port 3002 on 2026-11-09, "Thinking level is not supported for this model") and LINETTE-WEB-C (1 event, a Playwright run playing the Android app on linette.app/launch on 2026-11-13). Sentry lists 0 unresolved issues since: a new one is real, or a local run that forgot to keep its errors out (`known-root-causes.md`).
- Sentry, one thing the settings don't cover: an ERROR event still shows a city ("Geography: Montreal") although no IP is stored. Sentry works it out from the address of whoever delivers the envelope, and the `/monitoring` rewrite forwards the visitor's address (`x-forwarded-for`). Seen on 11.6.0 events; no error event exists yet on 11.12.0 to compare. The fix to try, not done: Sentry's own tunnel route handler (`export { POST } from "@sentry/nextjs/tunnel"`, 11.9+), which forwards the payload and no headers, then `scripts/sentry-envelopes/run.mjs` to prove it.
- Test infra: two runs signing the e2e account in at once voided each other's magic link; FIXED 2026-11-19, `mintSessionCookies` retries with a fresh link (4 sign-ins at once: 7 of 20 got in before, 16 of 16 after). Supabase allows 30 sign-in link checks per 5 minutes from one PC (a smoke run spends 13), and the harness now says so instead of failing with a bare 429; requests from this PC sometimes stall 10 to 70 s on connections to Supabase and Upstash (not the app, not production).
- Cleanup: unused Vercel env vars and the old Blob photos (`PRE-LAUNCH.md`, Data hygiene). `npm audit` lists 14 findings in dev tooling only, 0 in runtime dependencies.

## Key paths
- AI: `src/lib/gemini.ts` (model IDs + thinking), `src/lib/gemini-retry.ts`, `src/lib/daily-cap.ts`, `src/lib/log-ai-call.ts`
- Outfit rules: `src/app/api/suggest/route.ts` (shared predicates above `buildOutfit`), `src/lib/outfit-rules.ts`, `src/lib/suggest-prompt.ts`, harness `tests/e2e/rule-compliance.spec.ts`
- Tips: `src/lib/suggest-prompt.ts` (`stylingTipVoice`), `src/lib/tip-notes.ts` (`tidyTip`, the fixed notes), `src/lib/style-wishes.ts`, `src/lib/suggest-text-guards.ts`, `src/app/api/suggest/refine/route.ts`
- Android: `capacitor.config.ts`, `android/`, `.github/workflows/android.yml`, `scripts/android/emulator-check.mjs`, `src/lib/native-shell.ts`, `docs/android-shell-plan.md`, `docs/play-store-listing.md`, `docs/play-billing.md`, `store/android/`
- Upload key: outside every repo, `C:\Users\amera\Documents\code\.secrets\linette\` (README there, password in the central `.env`)
- Background removal: `src/lib/cutout/`, `src/app/api/items/normalize/route.ts`, `src/lib/owned-photo.ts`
- Billing: `src/app/api/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/subscription.ts`, `src/lib/supabase/proxy.ts`, `src/lib/play-purchases.ts`, `src/lib/play-billing-server.ts`
- Sentry: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/lib/sentry-data-collection.ts`, `scripts/sentry-envelopes/run.mjs`
- Tests: `src/**/*.test.ts` (Vitest), `tests/e2e/` (Playwright, signs in only as an account with "e2e" or "harness" in its email)
- Env: `.env.local.example` lists every variable the code reads. On this machine the Vercel CLI needs `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Gotchas
- Several sessions work in this repo's checkouts at once. Before starting a local server check the port is free, wait for your own process's "Ready" line, and stop it by the process id you started (`CLAUDE.md`, Commands). Every script that makes real AI calls should refuse a host other than localhost.
- Some files are stored with CRLF: a multi-line Edit anchor misses on them. Anchor on single lines (`CLAUDE.md`, Deploy).
- `?debug=rules` and the cap bypass need the email in `CAP_BYPASS_EMAILS`: true on a local server started with it, not on production, where the e2e account's caps apply (suggest 3 a day).
- Env vars that exist locally but not on Vercel fail silently in production; sensitive Vercel variables are write-only (`CRON_SECRET`: test with `vercel crons run /api/cron/keepalive`).
- The e2e account is grandfathered (created before the paywall cutoff): to test the paywall, serve the local build's `paywall.html` (Playwright `route.fulfill`) or use an account the paywall stops.
- Gemini free tier: 20 requests per model per day, reset at midnight Pacific. If AI Studio shows "Account inactive", reopen the Cloud billing account.
- Supabase: new `public` tables need explicit GRANTs to anon/authenticated in their migration.
- After a context compaction, re-read files from disk before "fixing" what looks like a revert.

## Next steps (ordered)
1. Check one full Style Me outfit on production with the new tips (In progress).
2. Google sign-in in the app, once he names the project's account, gives the OK and types its password (In progress).
3. RevenueCat and the billing phone test with him.
4. Production release: the phone swap, retaken screenshots, release notes, submit for review.
5. Email confirmation ON and the private photo bucket (`PRE-LAUNCH.md`).
6. Apple: enrollment, Sign in with Apple, an iOS build (needs a Mac with Xcode 26).

## Owner decisions (don't reopen)
- **Outfit text: the tip only (2026-11-09).** Wherever an outfit is shown the only sentence is the Stylist tip. The description (`reasoning` / `ai_reasoning`) is still written and saved, `relaxed` still comes back, neither is shown. The "Wardrobe gap" line stays.
- **Try-ons: 15 a month (2026-11-09).**
- **Annual plan CA$79.99, weekly CA$6.99 (2026-11-13).** Don't change the weekly price without asking.
- **Google Play billing through RevenueCat (2026-11-13);** store screenshots from a demo wardrobe, not his clothes; title "Linette: Your AI Stylist", package `app.linette`; countries Canada, the US, France and the English-speaking ones if easy.
- Gemini only in the app: "remodernize with Claude Opus 5.5" meant modernizing the code with Claude (2026-10-16).
- The real-phone upload batch is skipped; his phone is a Pixel 10 (2026-10-16).
- Vercel Performance size on (2026-10-17). To switch back: `PATCH /v9/projects/<project id>` with `resourceConfig.functionDefaultMemoryType: "standard"`, then redeploy. Keep any model's peak under 2 GB.
- Background removal signed off with the mirror pass (2026-10-17). Accepted limit: on white clothes against a white door, a door patch or a wall hook can stay.
- The 8 styling-rule taste calls (2026-10-17): belts optional on shift dresses and slim bottoms; shoes follow the hem; mid heels fine at casual and brunch, high heels never; heeled sandals fine with full wide-leg trousers, flat ones not; no statement piece needed at work or formal; one main metal on 2+ pieces plus one accent; for Cozy, earth tones are neutrals and a clash needs a strong warm next to a strong cool (by hex); bodycon at work only as a neutral midi or maxi under a blazer or cardigan.
- Entity stays 9537-1076 Québec inc. + DUNS 243370174, no restructure (2026-10-14).
