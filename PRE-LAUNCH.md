# Linette Pre-Launch Checklist

Running list of what's done and what remains before full public launch (vs. friends/beta testing, which is ready now).

**Operator:** 9537-1076 Quebec Inc.
**Domain:** linette.app
**Primary contact (user-facing):** hello@linette.app
**Developer contact (Google policy notices):** alex@automatable.co

---

## ✅ Done

### Infrastructure
- [x] Supabase project `oiefqivxuchsskfujopd` (us-west-2, Free tier; region checked 2026-10-17 through the Management API). Vercel functions run next to it in `pdx1`, and the daily `/api/cron/keepalive` stops the free plan's 7-day idle pause
- [x] Multi-tenant schema with Row Level Security on every table
- [x] Per-user storage bucket (`clothing-images`) with folder-level RLS
- [x] Wife's wardrobe migrated from Vercel KV → Supabase (45 items)
- [x] Vercel production deploy wired to `linette.app`
- [x] Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) set in Vercel production

### Auth
- [x] Email + password sign-up and sign-in
- [x] Google OAuth (Supabase provider wired, Google Cloud Console OAuth Client created)
- [x] `/auth/callback` route handles PKCE code exchange
- [x] Sign-out button on Profile page
- [x] Session cookie refresh via `src/proxy.ts` (Next 16 proxy convention)
- [x] Protected routes 401 on `/api/*` and redirect to `/login` on pages

### Privacy & security
- [x] `/privacy` and `/terms` pages (9537-1076 Quebec Inc.)
- [x] Cross-tenant RLS smoke test passes — `scripts/security-test.ts`
- [x] No service-role key in client bundle
- [x] Image upload signed URLs expire quickly

### PWA install
- [x] `manifest.json` with "Linette" name, icons, standalone display
- [x] iOS `apple-touch-icon`, status bar, web app title
- [x] Install prompt component on Profile page (native Android install, iOS instructions)

---

## 🚧 Before public launch

### Auth / security
- [ ] **Photo bucket → private + signed URLs** (audit A7; decided 2026-06: keep public during beta, switch before App Store submission — target August given a September launch). `clothing-images` is public-read today: URLs are unguessable UUIDs so practical risk is low, but a shipping consumer app should not serve user photos to anyone holding a URL. ~Half-day: flip the bucket private, mint signed URLs everywhere images render (wardrobe grid, cards, share images) and on server-side AI fetches (analyze/normalize/try-on). Update `/privacy` + FAQ copy afterwards to claim read protection again.
- [ ] **At public launch: set `INVITE_ONLY=false` in the Vercel env** to open Google signup (the invite gate added 2026-06 enforces invite-only BY DEFAULT in the auth callback — no code change needed to open the doors, and the env flag must also be considered for local dev if testing open signup).
- [ ] **Turn email confirmation ON** in Supabase (Authentication → Providers → Email → "Confirm email" toggle). Currently OFF to speed up dev/testing. Must be ON before wider launch to stop fake sign-ups.
- [ ] **Submit Google OAuth app for verification** to remove the "This app isn't verified" warning screen. Google review takes 1–4 weeks. Needed once we expect non-test-user sign-ins.
- [ ] **Add production test users** in Google Cloud Console for any friend who wants to use Google sign-in (while app is still in Testing mode, ≤100 users).
- [x] ~~Rate limiting on AI endpoints~~ — done (June audit, C4): per-user daily caps on all five Gemini endpoints (suggest 3 / refine 10 / try-on 3 / packing 2 / analyze 40) and on background removal (normalize 60), user-local-day reset, refunds on failures, admin bypass, KV-outage alerting.
- [x] ~~Account deletion button~~ — done: Profile → Settings → Privacy has the full delete-account flow backed by `/api/account/delete` (+ data export beside it).
- [x] ~~Password reset flow~~ — done: `/forgot-password` → Supabase reset email → `/auth/callback` → `/welcome` set-password.

### Content / legal
- [ ] Real app logo (1024×1024 PNG) for consent screens + store listings + favicon + PWA icons.
- [ ] Have a lawyer review `/privacy` and `/terms` before large-scale public launch.
- [ ] Add cookie/consent banner if targeting EU users seriously.
- [ ] Set up email forwarding: `hello@linette.app` → `alex@automatable.co` so support requests don't get lost.

### Mobile (Phase B Part 2 — separate plan)
- [x] **Store order (2026-10-23): Google Play first, then the App Store** (the owner's plan; checked the same day, it is the better order). The owner tests on a Pixel 10, and an Android build needs no Mac (iOS needs Xcode). Google's 12-testers / 14-days closed test applies only to personal developer accounts created after Nov 13 2023 (support.google.com/googleplay/android-developer/answer/14151465); this account is an organization (DUNS 243370174), so internal testing can go straight to production. Google's first review is quicker and more lenient; Apple adds Sign in with Apple (4.8, Google sign-in is offered) and rejects apps that feel like a website in a wrapper (4.2). $25 once vs $99 a year.
- [ ] **Google Play Console** enrollment ($25 one-time).
- [ ] **Apple Developer Program** enrollment ($99/yr, 2–5 day approval). Required if shipping to App Store.
- [ ] Capacitor wrap (iOS + Android native shells pointing at linette.app).
- [ ] Bundle ID decided + locked: `app.linette` (proposed).
- [ ] Apple Sign In (required by Apple guideline 4.8 since Google OAuth is offered on iOS).
- [ ] Native Google Sign-In plugin (`@capgo/capacitor-social-login`) to avoid OAuth-in-WebView issues.
- [ ] Deep link scheme (e.g. `app.linette://auth/callback`) + Universal Links.
- [ ] App icons per-platform, splash screens.
- [ ] Hide the Profile "Install Linette" card inside the store app (it gives browser-menu steps). It already hides in an installed PWA (`display-mode: standalone`, `install-prompt.tsx`); a Capacitor WebView needs its own check.
- [ ] Privacy labels / Data Safety form submissions.
- [ ] TestFlight / Play Internal Testing builds to 2–3 friends before public submission.
- [ ] **Decide the Apple developer name BEFORE creating the first App Store record.** It can read "Linette" only if Linette is a registered trade name of 9537-1076 (Quebec "déclaration de mise à jour courante", free), and it is set once, when the first app record is created, never changed after; otherwise it shows "9537-1076 Québec inc." forever. Seller always shows the legal name. Google Play publicly shows the legal name, address, developer email and phone.
- [x] Entity decided (2026-10-14): stays 9537-1076 Québec inc. + DUNS 243370174, no restructure. When filling store and SMS forms, copy the legal name and address EXACTLY as Apple's D-U-N-S lookup shows them (accents, unit number): registrations reject spelling mismatches.
- [ ] Store review requirements not built yet: Gemini consent screen (Apple 5.1.2(i)), report button on AI output (Play AI policy), 18+ age gate + terms (Gemini API terms require 18+, the terms say 13+), a public account-deletion URL (Play), a reviewer demo account with an active entitlement, and a Mac with Xcode 26 for iOS builds.

### Subscriptions
- [x] Web billing LIVE on Stripe (checkout, webhook, billing portal; CLAUDE.md "Billing (Stripe)"): $6.99/week with a 7-day trial on a first subscription, or $59.99/year. Accounts created before 2026-06-12 are grandfathered free. No real subscribers yet.
- [ ] Store apps: RevenueCat (StoreKit / Play Billing), a platform-aware paywall and Restore Purchases (i18n key `paywall.restore` exists).
- [x] ~~`<SubscriptionGuard>` wrapper~~: done as the middleware page gate (`src/lib/supabase/proxy.ts`), which sends non-subscribers to `/paywall`, plus the API 402 gate (`src/lib/require-subscription.ts`).
- [x] ~~Pricing / plan selection page~~: `/paywall` (annual pre-selected).

### Data hygiene
- [ ] Once wife's migration is clearly stable (≥1 week), delete the legacy Vercel KV blob at key `wardrobe-data`.
- [ ] Delete legacy Vercel Blob images once all items have been re-uploaded to Supabase Storage. The `wardrobe-images` Blob store holds 47 photos from April 2026 (317 MB, public URLs), and 10 real `clothing_items` rows still point at them (checked 2026-10-16): migrate those 10 into Supabase Storage first, then delete. Keep `models/` (the background-removal model).

### Polish
- [x] ~~First-run UX for empty accounts~~ — done: 4-step onboarding wizard + dedicated empty-wardrobe home state with add-item CTAs.
- [x] ~~Error feedback for failed uploads / saves~~ — done (June audit, C2/C3): every mutation checks the response; loads distinguish error-from-empty with retry; upload tiles show localized errors.
- [x] ~~Loading skeletons~~ — done on home / wardrobe / suggest / favorites (profile stats still flash 0 → real; minor, in the audit's deferred list).
- [x] ~~og:image / twitter:card~~ — done: `opengraph-image.png` + `twitter-image.png` + metadata in `layout.tsx`.
- [ ] SEO remainder: `sitemap.xml` + `robots.txt` (Next file conventions; ~15 min — only matters for public discoverability, not for the invite beta).

---

## 📅 Friend beta (ready now)

Share `https://www.linette.app` with friends. Tell them to sign up with **email + password** (avoids the Google "unverified app" warning). They can install the PWA:

- **iPhone (Safari):** Share → Add to Home Screen
- **Android (Chrome):** the in-app install prompt on the Profile page, OR browser menu → Install app

Friends using Google sign-in currently need their Gmail added to Google Cloud Console test users first (max 100).
