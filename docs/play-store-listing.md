# Google Play: the listing and the declarations

Prepared 2026-11-13 from what the code and the privacy policy say that day. Nothing here has been submitted. It is
the sheet to fill the Play Console from, so each answer names where it comes from. When the app changes (a new
provider, a new kind of data, billing in the app), change the answer here and in the Console together.

Waiting on the owner before any of it goes in: the Play Console organization account (owner account
hello@linette.app), his read of the texts and screenshots (they are public once published), and how the first
Android version charges (section 7).

## 1. Texts

Limits: title 30 characters, short description 80, full description 4,000. Counts are checked by
`node scripts/android/listing-check.mjs`, which reads this file.

### English (en-US, the default language)

<!-- listing:en:title -->
Linette: Your AI Stylist
<!-- /listing -->

<!-- listing:en:short -->
Outfits from the clothes you already own, for the weather and your day.
<!-- /listing -->

<!-- listing:en:full -->
Linette is a stylist for the closet you already own. Photograph your clothes once, and she puts together complete outfits from them, for today's weather, your mood and where you are going.

YOUR WARDROBE, IN YOUR POCKET
Take a photo of a piece, or pick up to 10 at a time. Linette removes the background, reads the color, the material and the category, and files the piece. You can correct anything she gets wrong.

WHAT TO WEAR TODAY
Tell her the occasion and the mood, or just ask. She checks the weather where you are, then builds an outfit from pieces you own, with one styling tip. Not for you? Ask for another, swap a single piece, or tell her what you want ("my red boots", "all black").

TRY IT BEFORE BUYING
In a shop, take a photo of a piece you are considering. Linette tells you whether you already own something like it, and how it would go with your wardrobe.

TRIP ESSENTIALS
Give her the destination and the dates. She looks at the forecast and lists what to pack from your own clothes.

SHE LEARNS YOUR TASTE
Save the outfits you like. Your favorites tell her which colors, cuts and pieces you come back to.

GOOD TO KNOW
• English and French.
• Light and dark mode.
• She never suggests clothes you don't own.
• The AI features have limits: 3 outfit suggestions a day, 2 packing lists a day, 15 try-ons a month.
• For adults (18 and over).

YOUR DATA
Your photos and your wardrobe are yours. Linette does not sell your data and shows no ads. Outfits are written with Google Gemini: the details of your wardrobe are sent to it for that, and a photo only when you add a piece or try one on. You can download your data or delete your account from the app at any time.

Questions or ideas: hello@linette.app
<!-- /listing -->

### French (fr-CA and fr-FR, the same text)

<!-- listing:fr:title -->
Linette : ta styliste IA
<!-- /listing -->

<!-- listing:fr:short -->
Des tenues avec les vêtements que tu as déjà, selon la météo et ta journée.
<!-- /listing -->

<!-- listing:fr:full -->
Linette est une styliste pour la garde-robe que tu as déjà. Photographie tes vêtements une fois, et elle en fait des tenues complètes, pour la météo du jour, ton humeur et l'endroit où tu vas.

TA GARDE-ROBE DANS TA POCHE
Prends une pièce en photo, ou choisis-en jusqu'à 10 à la fois. Linette retire l'arrière-plan, lit la couleur, la matière et la catégorie, puis range la pièce. Tu peux corriger ce qu'elle a mal lu.

QUOI PORTER AUJOURD'HUI
Donne-lui l'occasion et l'humeur, ou demande simplement. Elle regarde la météo là où tu es, puis compose une tenue avec tes pièces, avec un conseil de style. Ça ne te plaît pas ? Demande une autre tenue, remplace une seule pièce, ou dis-lui ce que tu veux (« mes bottes rouges », « tout en noir »).

ESSAIE AVANT D'ACHETER
En boutique, prends en photo une pièce qui te tente. Linette te dit si tu as déjà quelque chose de semblable, et comment elle irait avec ta garde-robe.

ESSENTIELS DE VOYAGE
Donne-lui la destination et les dates. Elle regarde les prévisions et dresse la liste de ce qu'il faut emporter, parmi tes vêtements.

ELLE APPREND TES GOÛTS
Garde les tenues qui te plaisent. Tes favoris lui montrent les couleurs, les coupes et les pièces auxquelles tu reviens.

BON À SAVOIR
• En français et en anglais.
• Mode clair et mode sombre.
• Elle ne propose jamais de vêtements que tu n'as pas.
• Les fonctions d'IA ont des limites : 3 suggestions de tenue par jour, 2 listes de voyage par jour, 15 essais par mois.
• Pour les adultes (18 ans et plus).

TES DONNÉES
Tes photos et ta garde-robe t'appartiennent. Linette ne vend pas tes données et n'affiche aucune publicité. Les tenues sont rédigées avec Google Gemini : les détails de ta garde-robe lui sont envoyés pour ça, et une photo seulement quand tu ajoutes une pièce ou que tu en essaies une. Tu peux télécharger tes données ou supprimer ton compte depuis l'appli, à tout moment.

Questions ou idées : hello@linette.app
<!-- /listing -->

Where each claim comes from: the feature list and the limits are the FAQ's (`src/app/faq/page.tsx`, "Is Linette
free?") and the `*_DAILY_CAP` / `TRY_ON_MONTHLY_CAP` constants; "never suggests clothes you don't own" is the FAQ's
first answer and how `/api/suggest` works (it picks ids from the wardrobe); the data paragraph is sections 3 and 5
of the privacy policy. The texts say nothing about price on purpose: that sentence depends on section 7.

## 2. Graphics

| Asset | Requirement | Where it is |
|---|---|---|
| App icon | 512 x 512, 32-bit PNG, up to 1 MB. Google rounds the corners itself: a full square, no transparency | `store/android/icon-512.png` (`node scripts/android-icons.mjs --store`) |
| Feature graphic | 1024 x 500, JPEG or 24-bit PNG, no transparency | `store/android/feature-graphic.png` (`node scripts/android/feature-graphic.mjs`: the launch screen's three lines on black) |
| Phone screenshots | 2 to 8, PNG or JPEG, 16:9 or 9:16, each side 320 to 3,840 px. At least 4 at 1080 px or more to be eligible for promotion | to capture once the owner agrees on the wardrobe shown |

The launcher icon inside the app is separate (`scripts/android-icons.mjs`, `android/app/src/main/res`).

Screenshots show a real wardrobe. The only complete one in a test account is the e2e account's 13 pieces, which are
the owner's own clothes (the reference photos of the background-removal comparison). They need his yes before they
are published, or a demo wardrobe of other photos.

## 3. Store settings

- App category: Lifestyle. Tags: chosen in the Console from Google's list (wardrobe, fashion, style).
- Contact email: hello@linette.app. Website: https://linette.app. No phone number.
- Privacy policy: https://linette.app/privacy.
- Countries: the owner's choice. Suggested start: Canada and the United States (English and French, one tax
  setup). Distribution in the EU adds the trader details Google shows on the listing (the organization's address
  and contact).

## 4. App content declarations

| Section | Answer | Why |
|---|---|---|
| Privacy policy | https://linette.app/privacy | public, no sign-in (`PUBLIC_PATHS`) |
| Ads | No ads | no ad SDK in `package.json`, none in the Android project |
| App access | Restricted: sign-in required. Give a demo account (email and password) that is already through onboarding and consent, with a wardrobe, and one line of instructions | every screen but the lobby needs an account |
| Content rating (IARC) | Category "Utility, productivity, communication or other". No violence, sexuality, language, drugs, gambling. Users cannot talk to or share content with other users in the app, and no location is shared with other users. Digital purchases: per section 7 | no social feature exists; the share button hands an image to Android's share sheet |
| Target audience | 18 and over only. Not designed for children | terms and sign-up line (18+), consent screen |
| News app | No | |
| Data safety | section 5 | |
| Advertising ID | Not used | the build's own report lists the permissions of the release app after every library is merged in: `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` and nothing else a person would see (run of 2026-11-13). No `AD_ID`. Read the "Android build" notice of the latest run again before answering |
| 16 KB memory pages | Nothing to do | the same report counts 0 native libraries in the app |
| Government app, financial features, health | No, none, none | |
| Generative AI | AI output can be reported in the app without leaving it | `ReportAiButton` under the outfit, the try-on and the packing results |
| Account deletion | In the app (Profile, gear icon, Account & security) and at https://linette.app/delete-account | the page lists what is deleted and kept |
| Photo and video permissions | Nothing to declare | the app asks for no storage or media permission: photo fields use the system picker and the camera app |

## 5. Data safety form

First three questions: the app collects user data (yes), all of it is encrypted in transit (yes, HTTPS only), and
users can ask for deletion (yes, https://linette.app/delete-account).

"Collected" means it leaves the phone. "Shared" means handed to another company for its own use: none is. Every
company that touches the data works for Linette as a service provider (privacy policy, section 5), which Google's
form does not count as sharing.

| Data type (Google's name) | Collected | Shared | Required | Purpose | What it is here |
|---|---|---|---|---|---|
| Approximate location | Yes | No | Optional | App functionality | Weather for outfits. Rounded to about 11 km on the phone before it is sent (`coarseCoords`); the city and that rounded point are saved on the profile. A city can be typed instead |
| Precise location | No | | | | The exact position never leaves the phone |
| Email address | Yes | No | Required | App functionality, Account management | The account |
| User IDs | Yes | No | Required | App functionality, Account management | The account's internal id |
| Other personal info | Yes | No | Optional | App functionality, Personalization | Gender, if the person gives it (default "not specified"): it picks the French wording and the styling track |
| Name | No | | | | Not asked. It would come with native Google sign-in: change this row the day that ships |
| Photos | Yes | No | Required | App functionality | Photos of clothes the person adds, and a photo of a piece tried on |
| Other user-generated content | Yes | No | Required | App functionality, Personalization | Wardrobe details, outfits, favorites, wear history, trips, style preferences, typed styling requests, notes on a report |
| App interactions | Yes | No | Required | App functionality, Analytics | A log line for each AI request (which feature, when, how long, tokens): the usage limits and cost tracking |
| Crash logs | Yes | No | Required | App functionality, Analytics | Errors, through Sentry, with the privacy baseline of `src/lib/sentry-data-collection.ts` |
| Diagnostics | Yes | No | Required | App functionality, Analytics | Page and request timings, through Sentry (`tracesSampleRate: 1.0`) |
| Purchase history | No (see section 7) | | | | Nothing is bought in the Android app while it has no store billing |
| Everything else (contacts, messages, audio, files, calendar, health, web history, device IDs, financial info) | No | | | | |

None of it is processed "ephemerally" in Google's sense except the position sent for the weather forecast itself.

## 6. Release

1. Create the app in the Console: name Linette, default language English (United States), App, Free.
2. Play App Signing on. The upload key is made once and kept outside the repo; the build reads it from the
   environment (`android/app/build.gradle`: `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`). Until it exists the workflow builds the release bundle unsigned.
3. Upload the bundle to internal testing first (the owner's own phone), then production. An organization account is
   not subject to the 12-testers-for-14-days rule that applies to new personal accounts.
4. Release notes, first version. English: "First version of Linette for Android." French: "Première version de
   Linette pour Android."

## 7. The open decision: how the first Android version charges

Google Play requires its own billing for a subscription sold inside an app, and forbids sending people to another
way to pay. Today a new account reaches a paywall that opens Stripe's checkout: that cannot ship in the Android app.
Three ways out, asked of the owner on 2026-11-13:

- **Free early access (recommended).** New accounts use the app free, with the existing limits, until a date he
  sets. No store billing to build, nothing to configure in the Console. The paywall code stays for later. Reasons:
  zero charges ever, and every account since June stopped at the paywall or before it.
- **Google Play billing through RevenueCat.** The real model, about a week of work, and it needs three more accounts
  from him (RevenueCat, a Play payments profile, a Google Cloud service account). `docs/android-shell-plan.md`.
- **No purchase in the app.** People would have to subscribe on the website first, and the app may not say so. A
  dead end for anyone who finds the app in the store.

Until he answers, the listing says nothing about price, "Digital purchases" in the content rating stays
unanswered, and "Purchase history" in the data form stays "No".
