# Closette Pre-Launch Checklist

Running list of what's done and what remains before full public launch (vs. friends/beta testing, which is ready now).

**Operator:** 9537-1076 Quebec Inc.
**Domain:** closette.boutique
**Primary contact (user-facing):** closette.boutique.app@gmail.com
**Developer contact (Google policy notices):** alex@automatable.co

---

## ✅ Done

### Infrastructure
- [x] Supabase project `oiefqivxuchsskfujopd` (us-east-1, Free tier)
- [x] Multi-tenant schema with Row Level Security on every table
- [x] Per-user storage bucket (`clothing-images`) with folder-level RLS
- [x] Wife's wardrobe migrated from Vercel KV → Supabase (45 items)
- [x] Vercel production deploy wired to `closette.boutique`
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
- [x] `manifest.json` with "Closette" name, icons, standalone display
- [x] iOS `apple-touch-icon`, status bar, web app title
- [x] Install prompt component on Profile page (native Android install, iOS instructions)

---

## 🚧 Before public launch

### Auth / security
- [ ] **Turn email confirmation ON** in Supabase (Authentication → Providers → Email → "Confirm email" toggle). Currently OFF to speed up dev/testing. Must be ON before wider launch to stop fake sign-ups.
- [ ] **Submit Google OAuth app for verification** to remove the "This app isn't verified" warning screen. Google review takes 1–4 weeks. Needed once we expect non-test-user sign-ins.
- [ ] **Add production test users** in Google Cloud Console for any friend who wants to use Google sign-in (while app is still in Testing mode, ≤100 users).
- [ ] Consider rate limiting on `/api/suggest` and `/api/packing` (Anthropic API costs money; one abusive user could rack up a bill).
- [ ] Account deletion button on Profile page (legally required for App Store; good to have anyway).
- [ ] Password reset flow (Supabase supports it — need a `/auth/reset-password` page).

### Content / legal
- [ ] Real app logo (1024×1024 PNG) for consent screens + store listings + favicon + PWA icons.
- [ ] Have a lawyer review `/privacy` and `/terms` before large-scale public launch.
- [ ] Add cookie/consent banner if targeting EU users seriously.
- [ ] Set up email forwarding: `closette.boutique.app@gmail.com` → `alex@automatable.co` so support requests don't get lost.

### Mobile (Phase B Part 2 — separate plan)
- [ ] **Google Play Console** enrollment ($25 one-time).
- [ ] **Apple Developer Program** enrollment ($99/yr, 2–5 day approval). Required if shipping to App Store.
- [ ] Capacitor wrap (iOS + Android native shells pointing at closette.boutique).
- [ ] Bundle ID decided + locked: `boutique.closette.app` (proposed).
- [ ] Apple Sign In (required by Apple guideline 4.8 since Google OAuth is offered on iOS).
- [ ] Native Google Sign-In plugin (`@capgo/capacitor-social-login`) to avoid OAuth-in-WebView issues.
- [ ] Deep link scheme (e.g. `app.closette://auth/callback`) + Universal Links.
- [ ] App icons per-platform, splash screens.
- [ ] Privacy labels / Data Safety form submissions.
- [ ] TestFlight / Play Internal Testing builds to 2–3 friends before public submission.

### Subscriptions (later)
- [ ] `subscriptions` table already exists as a stub. Needs: RevenueCat / StoreKit / Play Billing / Stripe integration.
- [ ] `<SubscriptionGuard>` wrapper around authed shell redirecting non-subscribers to `/subscribe`.
- [ ] Pricing / plan selection page.

### Data hygiene
- [ ] Once wife's migration is clearly stable (≥1 week), delete the legacy Vercel KV blob at key `wardrobe-data`.
- [ ] Delete legacy Vercel Blob images once all items have been re-uploaded to Supabase Storage (if we migrate old images; currently they stay on Vercel Blob indefinitely).

### Polish
- [ ] "Welcome / first-run" UX for brand-new empty accounts (currently they see an empty home page — should show an onboarding nudge).
- [ ] Error toasts for failed uploads / saves (currently silent errors).
- [ ] Loading skeletons on data-heavy pages.
- [ ] SEO: og:image, twitter:card, sitemap.xml, robots.txt.

---

## 📅 Friend beta (ready now)

Share `https://www.closette.boutique` with friends. Tell them to sign up with **email + password** (avoids the Google "unverified app" warning). They can install the PWA:

- **iPhone (Safari):** Share → Add to Home Screen
- **Android (Chrome):** the in-app install prompt on the Profile page, OR browser menu → Install app

Friends using Google sign-in currently need their Gmail added to Google Cloud Console test users first (max 100).
