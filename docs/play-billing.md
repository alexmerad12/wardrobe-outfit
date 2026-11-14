# Google Play billing: what is built, what must be set up, what is not proven

Decided by the owner on 2026-11-13: the Android app sells the subscription itself, through Google Play, with
RevenueCat in between. Google forbids any other payment inside an app, so in the app the website's Stripe checkout
never opens.

The code is on the branch `play-billing`. **It is not on main and must not be merged before a real test purchase
passes on a phone** (section 5): nothing here has talked to a real RevenueCat project or to Google Play yet.

## 1. How it works

- **In the app, the paywall** (`src/app/paywall/page.tsx`) shows Google Play's own prices and terms and buys through
  RevenueCat's Capacitor plugin (`src/lib/play-purchases.ts`). Like every plugin it is reached through
  `window.Capacitor.Plugins.Purchases`, nothing of it is bundled in the site. The page renders the website's version
  and the app's version of every price; `.web-only` / `.shell-only` show the right one before the first frame.
- **The customer id at RevenueCat is always the Supabase user id.** That is how the server knows which account a
  purchase belongs to. The plugin is configured (or switched with `logIn`) for the signed-in account before any plan
  is read or bought.
- **After a purchase or "Restore purchase"** the app calls `POST /api/play/sync`: the server re-reads that account at
  RevenueCat with the secret key and writes the `user_subscriptions` row. It asks up to 5 times, 2 s apart, because
  RevenueCat can lag Google Play by a few seconds.
- **`POST /api/revenuecat/webhook`** does the same for every account an event names (renewal, cancellation,
  expiry, failed payment, a purchase moved to another account). The event is only a signal: the row is always
  rewritten from RevenueCat's current answer, so late, repeated or out-of-order events are harmless, and no event id
  is stored. RevenueCat identifies itself with the Authorization value set in its dashboard.
- **One row per account, whoever sold it.** `user_subscriptions.source` is `stripe` or `play`
  (`supabase-migration-subscription-source.sql`, applied 2026-11-13). Each seller leaves the other's row alone
  unless its own subscription grants access (`mayOverwrite` in `src/lib/play-billing.ts`): a late Stripe "deleted"
  event cannot end a Google Play subscriber's access, and the other way round.
- **Access follows RevenueCat's entitlement** (`playStateFromSubscriber`): trial -> `trialing`, paid -> `active`,
  ended -> `canceled`, ended on a failed payment -> `past_due`. Google's grace period counts as active (set it to 0
  days in the Console to match Stripe, where a failed payment stops access at once).
- **Settings**: a Google Play subscription shows "Manage in Google Play" (Google's own subscription page). A Stripe
  subscription shows Stripe's portal in a browser and, in the app, one line saying it is managed on the web (no
  link: the app must not lead to another payment page).
- **Account deletion** stops a Google Play subscription from renewing first, through RevenueCat. If that fails,
  nothing is deleted and the screen says to cancel in Google Play. The RevenueCat customer is deleted afterwards.
- **The server refuses Stripe's checkout for the app** (`/api/checkout` answers 403 to the app's user agent), so no
  version of the app can open it.
- **Android**: `@revenuecat/purchases-capacitor` 14.1.0 (Play Billing Library 9), and the activity's `launchMode` is
  `singleTop` (with Capacitor's default `singleTask`, leaving the app to approve a payment in a banking app cancels
  the purchase: RevenueCat's installation guide).

## 2. The names (permanent once created in the Console: never renamed, never reused)

| What | Value |
|---|---|
| Subscription (Play Console) | `linette_premium` |
| Base plans | `weekly` (1 week, auto-renewing), `annual` (1 year, auto-renewing) |
| Offer on `weekly` | `trial-7d`: 7 days free, eligibility "new customer acquisition: never had this subscription" |
| RevenueCat entitlement | `premium` (`REVENUECAT_ENTITLEMENT` overrides it) |
| RevenueCat offering | the default one, with the packages "Weekly" (`$rc_weekly`) and "Annual" (`$rc_annual`) |

The code reads the plan from the base plan's name (`planFromPlayProduct`: "week" or "annual"/"year").

Prices: Stripe charges CA$6.99 a week and CA$79.99 a year. In the Console the price is set per country; set Canada
to the same numbers and let Google convert the others, then check each country's rounded price before saving. Google
keeps 15% of subscriptions.

## 3. What only the owner can open (in this order)

1. **Play Console** organization account (owner account hello@linette.app). Then, in it, a **payments profile**
   (the merchant account that receives the money: bank details and tax information, his to type).
2. **RevenueCat** account (free until US$2,500 of tracked revenue a month, then 1%): a project "Linette" with one
   Google Play app, package `app.linette`.
3. **A Google Cloud service account** that lets RevenueCat read purchases: created in the Google Cloud project
   linked to the Play Console, with the Pub/Sub Admin and Monitoring Viewer roles, invited in Play Console (Users and
   permissions) with "View financial data" and "Manage orders and subscriptions", its JSON key uploaded to
   RevenueCat. Google can take up to 36 hours to accept the key. (Roles and permissions as remembered from
   RevenueCat's "Google Play service credentials" guide: re-read that page when doing it, the list changes.)

## 4. Setup, once those exist (Claude does these with him)

1. Upload a first build to internal testing (a subscription cannot be created before the app has a build with the
   billing library). Needs the upload key (`docs/play-store-listing.md`, section 6).
2. Create the subscription, the two base plans and the trial offer of section 2. Activate them.
3. RevenueCat: add the two products, the entitlement `premium` attached to both, the default offering with the two
   packages. Customers > transfer behaviour: keep the default (a restore moves the purchase to the account that
   restores it).
4. RevenueCat webhook: URL `https://linette.app/api/revenuecat/webhook`, an Authorization value made for it.
5. Vercel environment, production and preview: `REVENUECAT_SECRET_KEY` (a secret API key of the project),
   `REVENUECAT_WEBHOOK_AUTH` (the same value as in step 4), `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` (the PUBLIC Google
   key, "goog_..."). The public key is read at build time: redeploy after adding it.
6. Play Console > License testing: add the owner's Google account, so test purchases cost nothing and renew every
   few minutes.

## 5. The test that must pass before this goes to main

On a real phone, with the internal-testing build installed from Google Play and a license-tester Google account:

1. A new Linette account reaches the paywall: Google Play's prices show, the weekly plan offers the free week.
2. Buy the weekly plan: Google's sheet opens, the app enters, the row reads `source = play`, `status = trialing`.
3. RevenueCat's dashboard shows the webhook delivered with a 200.
4. Cancel in Google Play: within minutes the row reads `cancel_at_period_end = true`, Settings says "Ends on".
5. Let it expire (test subscriptions do in minutes): the paywall comes back.
6. Sign in with a second Linette account on the same phone, tap Restore: the purchase moves, the first account loses
   access.
7. Delete an account that holds an active subscription: Google Play shows it cancelled, the account is gone.

## 6. Proven so far, and not

Proven (2026-11-13, a local production build):
- The pure rules: 19 unit tests in `src/lib/play-billing.test.ts` (plans, trial, grace period, refund, transfer,
  which seller may write a row).
- The paywall in the app, played in a browser with a stand-in for the plugin: `tests/e2e/play-paywall.spec.ts`, 7
  tests (store prices and terms only, no promise of a trial Google does not offer, buy, closing the sheet, a store
  failure, restore, the server's refusal of Stripe's checkout). It needs an account the paywall stops and a build
  with the public key: the top of that file says how. The standing e2e account was created on 2026-06-11, before the
  paywall cutoff, so it is let through for ever: the run of that day used a throwaway account made and deleted by a
  script.
- The webhook: 401 without or with a wrong Authorization, 200 and nothing done for the dashboard's test event, 400
  without an event, 500 (so RevenueCat retries) when RevenueCat cannot be read, 500 when not configured.
- The smoke suite still passes (21 tests), and the Android build carries the plugin (the run's "Android build"
  notice and the emulator check, which now requires `Purchases` among the plugins).

NOT proven, and why:
- Anything against a real RevenueCat project: the shape of its real answers (the code follows the API v1 reference),
  the webhook's delivery, the cancel call used by account deletion (the reference shows an order id like
  `GPA.3309-9122-6177-45730`; the code strips the `..N` renewal suffix, which is an assumption).
- A real purchase: needs a phone with Google Play and a license tester. GitHub's emulators have no Play Store
  account.
- What the plugin's raw error looks like when the person closes Google's sheet (the code accepts `code: "1"` at the
  top level or under `data`, and `userCancelled: true`).
