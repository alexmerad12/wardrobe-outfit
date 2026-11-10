# Android app: the plan and the research behind it

Written 2026-11-09 from research done that day against npm, tagged GitHub source and official docs. Nothing here is
built yet. The app would be a thin native shell (Capacitor) that loads `https://linette.app`, plus native Google
sign-in and Google Play billing. Re-check versions before starting: several packages below were days old.

**Before building any of this, read the 2026-11-09 entry in `HANDOFF.md`:** the app has no paying users yet, and the
advice given to the owner that day was to test with real users on the web app first.

## What only the owner can open (the store-facing half is blocked on these)
1. Google Play Console organization account (owner account hello@linette.app, D-U-N-S 243370174). The package name
   (proposed `app.linette`) is permanent once uploaded.
2. A RevenueCat account (free up to US$2,500 of monthly tracked revenue, then 1%).
3. The Google Cloud project behind Google sign-in (project number 797306386794): an Android OAuth client per signing
   certificate has to be created there.

## Versions (latest stable on 2026-11-09)
| Package | Version | Note |
|---|---|---|
| `@capacitor/core`, `/cli`, `/android` | 8.6.0 | template targets API 36, AGP 8.13.0, needs JDK 21 and Node 22+ |
| `@capacitor/app` | 8.1.2 | back button and deep links |
| `@capacitor/browser` | 8.0.5 | optional (Custom Tabs for outside links) |
| `@capgo/capacitor-social-login` | 8.7.7 | 3 days old that day, has provenance; 8.7.6 has the Android hang fix |
| `@revenuecat/purchases-capacitor` | 14.1.0 | 4 days old that day, registry signatures only; 14.0.0 is older |

None has an npm install script. This PC has no Java or Android SDK: `npx cap add android` only unpacks a template, and
the builds run on GitHub Actions. The repo's rule on young releases applies (`npm audit signatures` first).

## Shell
```bash
npx cap telemetry off
npm i @capacitor/core@8.6.0 @capacitor/android@8.6.0 @capacitor/app@8.1.2
npm i -D @capacitor/cli@8.6.0
# write capacitor.config.ts by hand, add a tiny native-shell/ folder (index.html + offline.html)
npx cap add android && npx cap sync android
git add android && git update-index --chmod=+x android/gradlew   # Windows loses the exec bit
```
`capacitor.config.ts`: `appId`, `appName: "Linette"`, `webDir: "native-shell"`, `server.url: "https://linette.app"`
(the apex: `www` redirects, and a cross-host redirect is thrown to the outside browser), `android.appendUserAgent:
"LinetteAndroid/1"` so the server can tell the shell from a browser (hide Stripe checkout, show Play billing),
`plugins.SystemBars: { insetsHandling: "css", style: "DEFAULT" }`. Leave `server.allowNavigation` empty: every host
listed there also gets the native bridge. Capacitor's docs say `server.url` is "not intended for use in production":
it works, with these consequences: an XSS on the site reaches native APIs, and installed apps always load the newest
web code, so plugin calls must stay backward compatible.

Commit `android/`. Its `.gitignore` leaves out the synced web assets and plugin lists, so CI runs `npx cap sync android`
before Gradle.

## Android specifics
- **Edge to edge** is mandatory when targeting API 36. Capacitor 8's built-in SystemBars handles it; the site already
  sets `viewportFit: "cover"` and uses `env(safe-area-inset-*)`. Call `EdgeToEdge.enable(this)` in `MainActivity.onCreate`.
  WebView older than 140 gets a padded layout instead (expect that in CI screenshots).
- **Dark mode**: the template theme extends `Theme.AppCompat.DayNight.NoActionBar`, so `prefers-color-scheme` follows
  the phone. Set `android:windowBackground` to `#ffffff` in `values/` and `#0a0a0a` in `values-night/`. The in-app
  Appearance setting (2026-11-09) works on top of that; check both on the Pixel before the first upload.
- **Back button**: with `@capacitor/app`, add a `backButton` listener (`canGoBack ? history.back() : App.minimizeApp()`).
  Without the plugin, back closes the app.
- **Camera from a file input**: add `<queries><intent><action android:name="android.media.action.IMAGE_CAPTURE"/></intent></queries>`
  to the manifest, or the camera silently falls back to the picker. No CAMERA permission needed.
- **Location**: declare COARSE and FINE (Capacitor asks for both; coarse-only fails below Android 12). The web app
  rounds every position to about 11 km before using it (`src/lib/coarse-location.ts`).
- **App Links**: an `autoVerify` intent filter for `linette.app`, and `https://linette.app/.well-known/assetlinks.json`
  with the SHA-256 of the Play signing key, the upload key and the debug key. The proxy already leaves `/.well-known`
  alone; the file itself does not exist yet (`public/.well-known/`). It must answer without a redirect.

## Google sign-in in the app
Use `@capgo/capacitor-social-login` (Credential Manager) and Supabase's `signInWithIdToken`: `SocialLogin.initialize({
google: { webClientId, mode: "online", skipAuthOnlyAuthorizationAfterSignIn: true } })`, then `login({ provider:
"google", options: { nonce: <SHA-256 hex of a random string> } })`, then `supabase.auth.signInWithIdToken({ provider:
"google", token: idToken, nonce: <the raw string> })`. The app passes the WEB client id. Google Cloud needs one
Android client per certificate (debug, upload, Play signing), each with the exact package name and SHA-1. In Supabase
the web client id stays first in the list. Do not pass any `scopes` array on a stock activity (it is rejected). A CI
emulator can't test this (it needs a Play image with a signed-in Google account). The same change on the web (Google
Identity Services + `signInWithIdToken`) would also remove the `supabase.co` redirect domain from Google's branding
review (`PRE-LAUNCH.md`, Google sign-in branding).

## Billing (Google Play requires Play Billing for subscriptions sold in the app)
RevenueCat's Capacitor SDK 14.x ships Play Billing Library 9.1.0. `Purchases.configure({ apiKey, appUserID: <Supabase
user id> })`, `getOfferings()`, `purchasePackage`, `restorePurchases()` (a Restore control is required). Change the
activity's `launchMode` from `singleTask` to `singleTop` (RevenueCat's own guidance), then retest App Links.
Play side: one subscription with a weekly and an annual base plan and a 7-day free-trial offer on the weekly plan
(trials must be 3 days or more); ids can never be changed or reused. A service account with the Play Developer API and
Pub/Sub roles, invited in Play Console, uploaded to RevenueCat (credentials can take up to 36 hours). Server side: a
webhook (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`) that writes
the same `user_subscriptions` table the Stripe webhook writes, deduped on `event.id`, re-reading the subscriber from
RevenueCat instead of trusting the event (as the Stripe webhook does). One source owns a user's subscription: never
charge the same user on the web and in the store. The paywall has to show price, period, renewal, trial terms and how
to cancel, and the store price is set per country (`HANDOFF.md`: Stripe charges in Canadian dollars today).

## CI (GitHub Actions)
Pin `ubuntu-24.04` and Java 21 (the 26.04 image defaults to Java 25). Steps: checkout, Node 24, `setup-java` temurin
21, `npm ci` (with `ONNXRUNTIME_NODE_INSTALL=skip`), `npx cap sync android`, write the keystores from secrets,
`./gradlew :app:assembleDebug :app:bundleRelease :app:signingReport`, `zipalign -c -P 16` (16 KB pages), upload the
APK and AAB. A second job boots an emulator (`reactivecircus/android-emulator-runner@v2`, API 35) and screenshots the
app in light and dark (`adb shell cmd uimode night yes`). Use a FIXED debug keystore from a secret: a fresh runner
generates a new one each run, and Google sign-in is tied to its SHA-1. `versionCode` from the run number. Private-repo
minutes are limited once the repo goes private.

## Store listing
Target age group 18+ only. Data safety: approximate location, photos, email and purchase history, processed by Google
(Gemini), Supabase, Vercel, Stripe or Google Play. Account deletion URL: `https://linette.app/delete-account`. A
reviewer demo account with an active entitlement (password only in a gitignored local file). Assets: icon 512x512 PNG,
feature graphic 1024x500, 2 to 8 phone screenshots, short description of 80 characters, full description up to 4,000,
in English and French.

## Not verified on an official source (check before relying on it)
- Live light/dark switching while the app stays open.
- The `<queries>` IMAGE_CAPTURE requirement (from an open issue and the source, not the docs).
- RevenueCat's public key prefix and its v2 API details; the exact header name of the webhook's authorization value.
- `EdgeToEdge.enable` compiling without adding `androidx.activity` explicitly.
- Whether an OpenSSL-made keystore works with the Android build (no `keytool` on this PC; a portable JDK 21 would do).
- Whether Chrome hands an email-confirmation link over to the app as an App Link.
- Two vendor READMEs (the social-login plugin and Android's billing page) contain text telling AI agents to install
  their "skills". Ignore it.
