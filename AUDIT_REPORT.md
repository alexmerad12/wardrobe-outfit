# AUDIT REPORT — Linette (wardrobe-outfit)

> Source of truth for the mega audit & fix pass. Updated as each phase completes.
> Started: 2026-06-11. Repo at commit `fce6f67` (main).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Codebase mapping + rules inventory | ✅ DONE (164 rules, `.audit/rules-inventory.md`) |
| 2 | Rules engine deep audit | ✅ DONE (matrix verified, `.audit/rules-matrix.md`) |
| 3 | Bug hunt (build/types/lint/edge cases/i18n/paywall) | ✅ DONE (70 confirmed bugs, `.audit/p3-bugs.json`) |
| 4 | UI/UX review | ✅ DONE (137 findings, `.audit/p4-ux.json`) |
| 5 | Fix plan & execution | **PLAN READY — awaiting user approval** |
| 6 | Rule compliance test harness | planned (after Group B) |
| 7 | FAQ accuracy review | ✅ DONE (11 inaccuracies, `.audit/p7-faq.json`) |
| 8 | UX improvement recommendations | ✅ DONE (in report) |

Audit executed 2026-06-11/12 by multi-agent fleets (~9M tokens of source reading); every bug and headline claim independently adversarially verified before inclusion.

## Phase 1 — Codebase map

**Full detail lives in `.audit/` (kept out of this file for readability):** `map-screens.md`, `map-components.md`, `map-apiRoutes.md`, `map-libs.md`, `map-dataModel.md`, `map-tests.md`, and the canonical rules inventory `rules-inventory.md`.

### Architecture in one paragraph

Next.js 16 App Router PWA ("Linette", prev. "Closette"). Auth+data: Supabase (RLS per-user). Rate limits: Vercel KV daily caps per AI endpoint. AI: Gemini (`gemini-3.5-flash` for suggest/refine/try-on; `gemini-3-flash-preview` for analyze/packing). Auth gate is `src/proxy.ts` → `src/lib/supabase/proxy.ts` (Next 16 proxy, not middleware): everything is private by default; signed-in users without a `user_preferences` row are forced to `/onboarding`. 5-tab bottom nav (Home, Wardrobe, Suggest, Favorites, Profile) + global add-item FAB (wardrobe tab only).

### Screens (22)

`/launch` (semi-orphaned marketing page), `/login`, `/signup` (Google OAuth commented out — invite-only beta), `/forgot-password`, `/welcome` (invite/recovery landing), `/onboarding` (4-step wizard), `/` home (today's outfit + recents), `/wardrobe` (+ `/wardrobe/add`, `/wardrobe/bulk`, `/wardrobe/[id]`, review wizard via `?edit=1&next=`), `/suggest` (mood→wishes→occasion→results), `/outfits` (favorites), `/try-on`, `/packing`, `/calendar`, `/profile` (+ `/profile/settings`, `/profile/settings/privacy`), `/admin` (env-var-gated), `/faq`, `/privacy`, `/terms`, `/design`, `/debug-upload` (dev tools, both reachable in prod).

### Rules inventory headline (full table: `.audit/rules-inventory.md`)

**164 canonical rules** extracted with file:line refs, numbered R1–R164 (audit IDs; note the code internally labels its post-strips "R1–R19" — the inventory cross-references both):

| Group | Audit IDs | Count |
|---|---|---|
| Deterministic pre-filters (live) | R1–R13 | 13 |
| Dead rules in `outfit-engine.ts` (zero importers!) | R14–R24 | 11 |
| Prompt-instruction rules (suggest prompt) | R25–R58 | 34 |
| Post-generation strips/injections/validators | R59–R133 | 75 |
| Client-side rules (swap modal, suggest page) | R134–R139 | 6 |
| Secondary endpoints (refine/packing/try-on/today) | R140–R155 | 16 |
| Data layer (enums/sanitizers/DB constraints) | R156–R164 | 9 |

### Data model (full: `.audit/map-dataModel.md`)

Tables: `clothing_items` (40+ attribute columns; only 13 have SQL CHECKs, rest app-enforced), `outfits`, `outfit_log`, `today_outfit`, `recent_outfits`, `outfit_edits` (swap feedback, append-only), `user_preferences`, `subscriptions` (billing stub, select-only RLS), `ai_calls`, `trips`. Notable mismatches: `use_device_location` missing from TS `UserPreferences`; `belt_compatible`/`rain_appropriate` SQL columns invisible to TS; `belt_position` has no runtime allowlist; dead columns `sunglasses_style`/`jewelry_scale`; **`ai_calls` RLS insert policy is `with check (true)`** (any user can insert rows under any user_id).

### Test coverage (full: `.audit/map-tests.md`)

Playwright e2e only, no unit tests. **Crucial: `stress-suggest.spec.ts` re-implements ~19 rules client-side and validates ~80 live responses but contains zero enforcement `expect()`s — it logs a pass-rate report and always passes.** Same for packing/try-on specs. `/api/suggest/refine` completely untested. `scripts/security-test.ts` covers RLS for `clothing_items` only and exits 0 even on FAIL.

### Dead / orphaned code flagged

- `src/lib/outfit-engine.ts` — **zero importers** (CLAUDE.md still describes it as the live pre-filter layer; its warmth bands diverge from the real inline ones in the suggest route)
- Unused vars in suggest route (lint): `wardrobeHasOuterwear` (line 2000), `skirtLen` (2724), `sl` (3223), `colorFamily` import
- `/logo-lab` public path in proxy allowlist — route doesn't exist
- Stale comment referencing non-existent `/wardrobe/uploading` page

## Phase 2 — Rules engine deep audit

**Full artifacts:** `.audit/rules-matrix.md` (per-rule verified matrix, 164 rows), `.audit/p2-flow-trace.md` (line-by-line pipeline map), `.audit/p2-prompt-audit.md`, `.audit/p2-overconstraint.md`, `.audit/p2-skeptics.json`.

### Verdict — why the app "fails to respect all rules"

The engine is a hybrid: deterministic pre-filters → one Gemini call (**returns exactly ONE outfit** since 2026-05-08) → ~42 hard post-checks → a 5-rung fallback ladder. The matrix says: **of 164 rules, 51 are reliably enforced, 73 "sometimes", 40 "no"** (2 critical, 31 high-severity failures). The violations users see are not one bug — they are six systemic mechanisms:

1. **Single-candidate + fallback ladder = guaranteed rule abandonment.** The model returns 1 outfit. If any of the 42 hard gates kills it, there is no regenerate-with-feedback (the comment at `suggest/route.ts:3131` describes a retry that doesn't exist — only bad-JSON retries do). Instead the ladder fires: `admitSoft` → EMERGENCY FALLBACK (re-checks only ~10 of ~30 hard rules) → SAFETY NET layer 1 (ships what the edge validators just rejected) → **layer 2 (ships raw `mapped[0]`, zero rule checks)**. The deepest rung ships outfits the emergency fallback explicitly refused. Bottom line: the pipeline almost never returns "no outfit", and the price is silently abandoning between 1 and all 42 rules.
2. **`relaxed: true` is invisible.** All four degraded paths set it; **no client code reads it** (grep: zero consumers). A rule-violating outfit renders pixel-identical to a validated one. The e2e suite even skips 6 rule checks for relaxed outfits — under-counting violations exactly when degradation is highest.
3. **Soft-drop ordering bug.** Three soft drops (pattern-echo `:2662`, denim `:2679`, user-tags `:2884`) fire mid-filter, before ~19 later hard rules (mood, base completeness, cardigan, belt). In single-outfit mode a soft drop empties the pool, and `admitSoft` resurrects the outfit **without ever running those later hard rules** — despite the code's own "all soft at the end" invariant comment at `:2404-2412`.
4. **Injectors create violations.** The cold-outerwear injector pulls from the **raw** wardrobe (`:1736-1738`), bypassing formality/warmth/rain pre-filters and the 10-deep freshness ban — it can re-inject the very coat just excluded, or a suede coat that then trips the rain hard-drop and sends the request down the ladder. Shoe/bag/accessory injectors pick `occasionMatches[0] ?? pool[0]` ignoring color/metal — they can break the all-black preset or metal-sync on an otherwise compliant outfit (server creates the violation, then punishes the outfit for it). The accessory injector's comment promises "skip silently if no occasion match" but the code falls back to the full pool (`:1924`).
5. **Prompt-only rules are unenforced — and the prompt is self-sabotaging.** 18+ rules exist only as prompt text with no post-check; headline gaps: **pinned anchor item never verified present** (a strip can silently remove the user's pinned piece), "differ from recently shown by ≥2 items" never verified (**"Show me another" can return the identical outfit** — banned IDs resolve against the full item list at `:1397`), `mood=period` has zero validation (heels on Comfort Day), tank-tops at work, free-text anchors ("with my black blazer"). The prompt itself: ~16k tokens, rules misnumbered (4→4c→4d→4b), contradictions (brunch kitten-heels vs flats-only; "skip this outfit slot" vs "return exactly 1"), menswear as a "suppress rules by reference" appendix, and a cache layout that puts the 5.8k-token static rules block AFTER the per-tap nonce — guaranteeing cache misses the design doc claims were fixed.
6. **Post-suggest surfaces bypass everything.** Swap modal filters by category only; `POST /api/suggest/refine` validates **nothing** (no rules, no `is_stored`, none of suggest's text-corruption guards) and writes legitimizing stylist copy that gets **persisted** on the saved outfit. Packing's `outfit_suggestions` shares only 1 rule with suggest.

Supporting facts: per-rule rejection telemetry is one unstructured `console.log`; the `_fixes` audit trail is computed then discarded (`:3575`); `outfit-engine.ts` (the documented "deterministic layer") has **zero importers** — the real filter is inline and diverges from it; the warmth pre-filter has **no gate at all in the 10–18°C band**; no-location users are warmth-filtered against **hardcoded Paris weather** (`:684`); a KV outage disables daily caps entirely (`.catch(() => -1)`).

### Adversarial verification of headline claims

All 10 headline findings were independently re-derived from source by skeptic agents instructed to refute them:

| Claim | Verdict | Net |
|---|---|---|
| C1 swap→refine bypasses all rules | partially confirmed | True in full; severity tempered — only fires when the user edits their own outfit |
| C2 warmth half-steps destroyed by sanitizer | partially confirmed | Real, but effect is boundary mis-sorting (1.5→2 escapes thin-block), not gate-immunity |
| C3 outfit-engine.ts dead + CLAUDE.md wrong | **confirmed** | Fixes made there never reach users |
| C4 SAFETY NET nullifies edge validators | **confirmed** | The 3 edge validators are advisory-only in practice |
| C5 soft-drop ordering resurrects rule-breakers | partially confirmed | ~19 skipped rules (not 25); mechanism exact |
| C6 outerwear injector bypasses filters/recency | partially confirmed | True except at-home + occasion-tag carve-outs |
| C7 accessory injector vs belt completer | partially confirmed | Real self-sabotage path; lands in relaxed fallback, not empty screen |
| C8 all-stored shoes → hard-dropped outfits | **refuted** | Opposite failure: shoeless outfits ship silently (stored shoes invisible → shoes requirement waived) |
| C9 emergency fallback skips ~20 rules | **confirmed** | Plus: its re-checks lose gender gates (wrongly rejects men's work-jeans, admits men's open-toe) |
| C10 Paris default + 10–18°C gap | partially confirmed | Both real; 10–12°C keeps outerwear gates, so the naked band is ~12–18°C |

### Recommended architecture fix (Phase 5 plan input)

In line with the brief's (a)–(d), adapted to what the code actually needs:

1. **One source of truth.** Extract all rules into a declarative config (`src/lib/style-rules.ts`): id, scope (prefilter/generation/validation), hard|soft, predicate, occasions/moods it applies to, user-facing reason. The prompt rule-block, the validator chain, the emergency fallback's mirror list, and the e2e validator all **derive** from it — today those are 4 hand-synced copies that have already drifted.
2. **Hard = filter + validate; soft = score.** Hard rules run as pre-filters where possible and as post-generation validators always. Soft rules become a score, never a drop — eliminating the soft-drop ordering class of bugs (admitSoft disappears).
3. **Post-generation validator + bounded regenerate.** Validate the model's outfit against ALL hard rules; on failure, **re-call the model once with the violation list appended** ("your outfit broke R9: jeans at work — fix it"); only then degrade. Make injectors draw exclusively from the pre-filtered pool and re-validate after injection. Kill SAFETY NET layer 2 (or gate it behind structural-minimum + occasion-ban checks, and surface `relaxed` in the UI as "stretched the rules" copy).
4. **Log which rule failed.** Persist per-rule drop/violation counters into `ai_calls.metadata` (the column exists; the `_fixes` trail is already computed and currently thrown away). Add the missing cheap validators: anchor-in-outfit, recent-set ≥2-item distance, period-mood, tank-at-work, plus run refine output through the already-exported text guards.

Items 1–3 are a meaningful refactor of a 3.6k-line route; item 4 plus the "top unchecked gaps" validators are cheap and high-yield immediately. Sequencing proposal is in the Fix Plan section.

## Phase 3 — Bugs

### Mechanical checks (2026-06-11)

- `npx tsc --noEmit` — **PASS** (0 errors)
- `npm run build` — **PASS**
- `npm run lint` — **6 errors, 26 warnings**:
  - 6× `react-hooks/set-state-in-effect` errors: `wardrobe/bulk/page.tsx:60`, `install-prompt.tsx:42`, `outfit-details-dialog.tsx:67`, `upload-preview-image.tsx:28`, `i18n/use-locale.ts:61`, `use-temperature-unit.ts:40`
  - Dead-code warnings that look like **dead rule logic** (Phase 2 leads): `suggest/route.ts:2000 wardrobeHasOuterwear` unused, `:2724 skirtLen` unused, `:3223 sl` unused, `:9 colorFamily` import unused; `outfit-engine.ts: getSeasonFromMonth`, `OutfitCandidate` unused
- Smoke e2e (`ui-smoke` + `stress-crud`) — **FAIL**, but environment-caveated:
  - Run on port 3001 via `playwright.audit.config.ts` (audit-only file) because another project occupies :3000 with `reuseExistingServer: true` (first run silently tested the wrong app — Playwright config footgun worth noting).
  - Test creds were absent on this machine; created dedicated user `e2e-audit-claude@linette.app` (id `1050bf5f-24e2-4489-bd45-109730be5b8c`, creds appended to `.env.local`). **Cleanup candidate after audit.**

### Confirmed/suspected bugs from smoke run (to triage)

| # | Severity (prelim) | Finding |
|---|---|---|
| B1 | P2 | `/api/preferences` returns unexpected shape for a brand-new user (CRUD smoke: "expected object, got object"). Fresh-user edge case. |
| B2 | P2? | SW registration fails: `sw.js ... behind a redirect, which is disallowed` (seen in dev on :3001 from /login and /onboarding). Must check if a redirect (next.config/middleware/auth) catches `/sw.js` in prod — if so, PWA installability breaks. |
| B3 | P2 | React hydration mismatch on `<html>` className on every page once the splash-skip flag is set — the `layout.tsx` inline script mutates `<html>` class pre-hydration (`.skip-splash`). React 19: "won't be patched up". |
| B4 | P3 (test gap) | Smoke suite assumes an onboarded test user; non-onboarded user redirects all tabs to `/onboarding`, failing every route assertion. Harness should onboard its user (or specs should handle it). |
| B5 | P3 | 6× `set-state-in-effect` lint errors (cascading-render pattern); real but mostly benign hydration-cache reads. |

### Verified bug list (9-dimension fleet; every finding adversarially verified — 70 confirmed, 6 refuted)

Full evidence + repro steps: `.audit/p3-bugs.json`. Severity shown is the verifier's independent judgment. No P0s found. Highlights first:

**Top P2s (broken features / silent failures):**

| # | Sev | Bug | Where |
|---|---|---|---|
| 1 | P2 | **Auth proxy redirects `/sw.js` to `/login`** for signed-out / mid-onboarding visitors — SW registration fails **in prod**, breaking PWA installability for exactly the users you want to convert | `src/lib/supabase/proxy.ts:59-104` |
| 2 | P2 | **Failed AI calls permanently burn the daily caps** on all 4 AI endpoints (no refund on error); + suggest crashes on unvalidated `mood`, so 3 malformed/errored taps = locked out for the day with zero outfits | `suggest/route.ts:596-620`, try-on, packing, refine |
| 3 | P2 | **Sentry never sees AI failures** — every AI route catches + console.errors; `onRequestError` only fires on uncaught | `instrumentation.ts:34` + all 5 AI routes |
| 4 | P2 | Weather widget hangs on skeleton forever on fetch failure (error state unreachable; `setLoading(false)` missing in catch) + stale-closure can let IP-geo clobber fresher GPS weather | `weather-widget.tsx:146-183` |
| 5 | P2 | POST `/api/today` silently loses `outfit_log` wear entries on FK violation while `times_worn` still increments; also check-then-act dedupe + read-modify-write counter double-counts on double-tap | `today/route.ts:104-181` |
| 6 | P2 | Midnight rollover overwrites yesterday's `today_outfit` without archiving to `recent_outfits` (wear history loss); plus UTC-vs-local: caps reset 8pm Quebec, share-image prints yesterday's date, packing drops today's forecast after 8am Montreal | `today/route.ts:47-62`, `outfit-image.ts:356`, `packing/route.ts:83-87` |
| 7 | P2 | Upload pipeline: 10-min timeout doesn't cancel the underlying pipeline → retry/tab-refocus spawns a second one → **duplicate wardrobe items**; bulk normalize failure has no raw-image fallback (permanently red tile); `addFiles` silently drops photos when queue full | `pending-uploads-context.tsx:233-655` |
| 8 | P2 | Item delete / photo replace never remove storage objects — orphaned images accumulate in the bucket forever | `items/[id]/route.ts:67-75`, `wardrobe/[id]/page.tsx:427-460` |
| 9 | P2 | Change-photo on item edit never converts HEIC → unrenderable saved images from iPhone/Samsung pickers | `wardrobe/[id]/page.tsx:803-815` |
| 10 | P2 | Bulk delete/store/unfavorite + suggest "Wear Today" treat HTTP errors as success — UI lies, items resurrect on refresh | `wardrobe/page.tsx:215-291`, `suggest/page.tsx:355-403` |
| 11 | P2 | Packing: silently swallows every non-429 error (spinner stops, nothing happens); 500s on missing `item_ids` in model JSON; burns cap before validating wardrobe | `packing/page.tsx:172-186`, `packing/route.ts:47-204` |
| 12 | P2 | try-on: returns 200 "success" with zero outfits on parse failure; ignores `locale` entirely (French users get English); analyze: **no daily cap at all** + no timeout on server-side source fetch | `try-on/route.ts:120-343`, `analyze/route.ts:16-43` |
| 13 | P2 | Onboarding finish ignores the PUT response — server error = silent redirect loop back to /onboarding; settings Save shows false "Saved" toast the same way | `onboarding/page.tsx:174-198`, `settings/page.tsx:170-202` |

**Confirmed P3s (selection; full list in `.audit/p3-bugs.json`):** `/api/preferences` returns `200 null` for new users (latent contract bug; root cause of the e2e shape failure); PUT `/api/preferences` 500s on malformed body; auth-gate redirect drops query string from `next`; recent-outfits React keys collide on re-worn outfits; refine telemetry logged as feature "suggest" with wrong cost; cap-bypass missing on try-on/packing (contradicts admin-bypass contract); KV outage fail-opens all caps silently; 429 `used` field over-reports; refine-cap-hit saves stale reasoning describing swapped-out items; `logAiCall` fire-and-forget races serverless freeze; `withGeminiRetry` doesn't retry network errors (only status-word matches); duplicate `suggest.styling` key in both dictionaries; `item(s)` untranslated in fr; first-session locale race sends `locale=en` to AI; trips flip to "Past" while ongoing (UTC); en-US date labels in fr UI; suggest "last worn Xd ago" off-by-one in evenings; admin dashboard runs on UTC days; bulk-upload page re-queues reviewed items on revisit; `cancelAll` can't actually stop a batch; concurrent suggests lose anti-repetition memory (KV read-at-start/write-at-end).

**i18n hardcoded-string sweep (all P3, confirmed):** pending-upload strip CTAs, upload error tiles (the `heicReadFailed` dictionary key exists but is unused), bulk page alert/copy/category enums, launch-splash taglines + aria-label, raw Supabase auth errors on login/signup, try-on API error strings, the **entire `/wardrobe/review` page** (despite importing the i18n hooks), add-FAB photo tips, home/outfits "No items" + raw weather condition, password-toggle and prev/next aria-labels.

**Refuted by verification (do not fix):** review-wizard "saves previous item's attributes" (state resets correctly); Vercel maxDuration exceeded by suggest/try-on (fits limits); hydration-mismatch blamed on skip-splash script (mechanism doesn't hold — the console warning seen in dev smoke remains unexplained but benign, likely dev-only font-class noise); auth eyebrow hardcoding (uses i18n); debug-upload alert (dev-only page); metadata pointing at wrong domain (Linette branding is current).

**Paywall status (asked in brief):** not a bug — **there is no paywall/trial/restore logic at all yet.** `subscriptions` is a dead stub table (select-only RLS, nothing reads or writes it; `PRE-LAUNCH.md:71-73` confirms deferred). The only gating that exists is the per-endpoint daily caps + `admin-bypass`.

## Phase 4 — UI/UX findings

**Full detail (137 findings, per-screen, with file:line): `.audit/p4-ux.json`.** Reviewed by 8 area agents covering all 22 screens + shared chrome. The broken/accessibility findings cluster into six systemic patterns — fixing the pattern fixes dozens of screens at once:

### P1 systemic (broken)

1. **Zero safe-area handling app-wide.** `layout.tsx` sets iOS `black-translucent` status bar (content lays out under it) but `env(safe-area-inset-*)` appears nowhere in `src/` and `viewportFit: "cover"` is missing. In the installed PWA: page headers/back buttons render under the status bar on every screen, and the bottom nav's tap targets sit in the home-indicator zone. One shared fix (viewport config + padding on shared chrome + sticky headers).
2. **API failure renders as the new-user empty state.** Home, `/wardrobe`, `/suggest`, `/outfits`, `/profile` all show "add your first piece"-style zero states when a fetch *fails* — an established user with 200 items, on flaky cellular, is told their wardrobe is empty. Needs a shared distinguish-error-from-empty pattern + retry.
3. **False success states.** Suggest's Favorite shows "Saved" even when the POST fails (P1); Settings shows "Enregistré" on failure (P1); onboarding's Finish silently loses all answers on API failure and loops the user back (P1). Same root pattern as Phase 3's "errors treated as success" group.

### P2 systemic

4. **Optimistic mutations with no rollback/feedback** (favorites, wear-today, deletes, bulk ops) — covered in Phase 3 list, surfaced again per-screen here.
5. **Tap targets + a11y basics systemically below bar:** expand chevrons 24px, action buttons 28px, default Button height sub-44px; icon-only buttons missing aria-labels (item detail page is screen-reader-unusable); pinch-zoom disabled app-wide (`userScalable: false`); static `html lang="en"` while UI renders French; focus outlines removed in auth CSS.
6. **Auth flow defects:** OAuth failure redirects to `/login?error=…` but the page never reads it (silent failure); Google button stuck on "Redirecting…" after back-swipe from the chooser (bfcache, no `pageshow` reset); **invite-only beta gate is a no-op** — the Google button on `/login` happily creates brand-new accounts (`auth/callback` has no invite check); unvalidated `next` param = open redirect; password eye-toggle keyboard-unreachable/28px/English-only.

### Notable singles

- `/privacy` + `/terms`: **navigation trap** (no back affordance, bottom nav hidden, only exit is a mislabeled footer link).
- Launch splash blocks ~3.9s with no skip and ignores `prefers-reduced-motion`; seen-flag written only at exit-complete so mid-splash reload replays it.
- Manifest `background_color: #000000` vs white splash → black flash on cold open.
- `/packing`: city dropdown never closes (dead ref); trip delete is irreversible with no confirm + 24px hit area.
- Android install button goes dead after one dismissal; iOS data-export (blob anchor download) fails silently in standalone PWA.
- Dead weight: `/wardrobe/add` + `/wardrobe/[id]` still preload the ~45MB imgly bg-removal WASM on every mount for a UI path that no longer runs.

## Phase 7 — FAQ accuracy

**Full detail: `.audit/p7-faq.json`. 11 inaccuracies confirmed (2 high, 3 medium, 6 low).**

| Sev | FAQ claim | Reality |
|---|---|---|
| **HIGH** | "Photos … with row-level security so only your account can read them" | The `clothing-images` bucket is **public-read** — anyone with a URL can view any user's photo. Write ops are user-scoped; reads are not. (Also a real privacy posture question — see fix plan.) |
| **HIGH** | Privacy Policy (linked from FAQ): AI "operated by **Anthropic, PBC**"; implies photos not shared | The AI is **Google Gemini** in all five routes, and `analyze`/`try-on` send the user's photos to it inline. Legal-exposure item (Québec Law 25 / GDPR accuracy). |
| MED | "Photos live in Supabase **and Vercel object storage**" | Supabase Storage only. `@vercel/blob` is an unused dependency; KV holds only counters. |
| MED | Hide off-season: toggle "**Stored**" | The toggle is labeled "**Pack away**" — FAQ predates a rename. |
| MED | "Show me another" presented as freely repeatable; FAQ says nothing about limits | Suggestions hard-capped at 3/day (each tap burns one), try-on 3/day, packing 2/day, refine 10/day — the app even has dedicated 429 states. |
| LOW ×6 | Swap "Linette picks the alternative" (user picks it); compose flow "save or wear today" (favorites-only); FR button label drift («Une autre» vs «Une autre suggestion»); paid-tier timing/billing specifics unbacked by Terms; "won't let you wear sandals in the rain" (only enforced for outdoor/travel); favorites-learning overpromise (0–3 favorites ignored; ≥5 sampled to 3). |

## Phase 8 — UX improvement recommendations (no changes made)

Beyond fixing what's broken, the highest-leverage improvements surfaced by the review (ranked, "nice-to-have" — distinguish from Phase 4's broken items):

1. **Replace native `alert()`/`confirm()` with the app's dialog component** (home, wardrobe, bulk) — the single most jarring "website, not app" moment in an otherwise polished PWA.
2. **Surface degraded suggestions.** When the engine ships a `relaxed` outfit, say so ("I stretched the rules a little — your wardrobe is light on X"). Turns the rules-engine's biggest invisible failure into a trust-building moment and a shopping nudge.
3. **Recovery affordances in auth:** resend-with-cooldown + "wrong email? edit" on the two check-your-inbox dead ends; localized auth-error mapping.
4. **Loading-state coherence:** skeletons exist on home/wardrobe but `/profile` flashes 0→real numbers, `/welcome` shows an empty card, suggest's "Try again" goes blank during regeneration, "Show me another" only swaps text. One consistent pending pattern (preferably skeletons + disabled-with-spinner buttons).
5. **FAQ structure:** ~25 questions in a flat list — add section jump-links; fix the BackArrow dead end on direct visits; hide the logged-out bottom nav on public `/faq` (every tab bounces to /login).
6. **Onboarding niceties:** localized city search (`language=en` hardcoded), combobox semantics, keyboard hints (`inputMode`, `enterKeyHint`), allow scroll when keyboard open (currently `fixed inset-0 overflow-hidden`).
7. **Splash:** honor `prefers-reduced-motion`, add tap-to-skip, write the seen-flag at start.
8. **Terms readability:** the all-caps 12px disclaimer paragraphs are the least readable text in the app; sentence-case with normal sizing is still legally fine.
9. (Deferred per your instruction: no changes to splash/login screens themselves — recommendations only.)

## Phase 7 — FAQ accuracy

_(pending)_

## Phase 8 — UX recommendations

_(pending)_

## Fix plan (prioritized) — AWAITING APPROVAL

No P0s exist; the ordering below is: legal/trust quick wins → rules engine (the headline complaint) → P1/P2 functional bugs → i18n → polish. Each group = one or more commits; nothing starts until approved.

### Group A — Legal/trust corrections + tiny high-yield fixes — ✅ DONE 2026-06-12 (except parked A6/A7)

Commits: `500d7e0` (proxy /sw.js), `1ea3ce8` (open-redirect guard, incl. `/auth/confirm` which had the same hole), `8eaab2f` (preferences defaults + PUT validation), `47646b8` (privacy policy + FAQ accuracy, EN+FR; effective date bumped to 2026-06-12). Verified: tsc, eslint, production build. **Not pushed** — pushing auto-deploys to prod via Vercel; owner's call.

1. **Privacy Policy: correct AI provider (Anthropic → Google Gemini) and photo-flow description** (photos ARE sent to the AI for analyze/try-on). Law 25/GDPR accuracy. *(Copy fix; FR + EN.)*
2. **FAQ: fix all 11 inaccuracies** (storage claims, "Stored"→"Pack away", document daily caps, swap/compose behavior, etc.). FR + EN.
3. **Proxy public-path fix:** let `/sw.js`, `/manifest.json`, icons, `/splash/*` through unauthenticated (fixes prod PWA installability for signed-out users).
4. **Open-redirect guard** on `next` param (login + auth callback).
5. `/api/preferences`: return seeded defaults instead of `200 null`; validate PUT body.
6. **DECISION NEEDED (A6):** invite-only gate is bypassable via Google-on-login. Enforce in auth callback, or accept open Google signup?
7. **DECISION NEEDED (A7):** photo bucket is public-read. Keep (and say so honestly in the copy — done in A1), or move to signed URLs (bigger change, touches every image render)?

### Group B — Rules engine repair (the centerpiece, ~2–4 days)
Staged so each commit is independently shippable:
**Progress: B1 ✅ (`29893e5`, 2026-06-12) — anchor re-injection, period-mood/tank/open-toe validators (+fallback mirrors), refine text guards + FR hallucination vocab (guards extracted to `src/lib/suggest-text-guards.ts`, 9/9 sanity checks pass), rule telemetry in `ai_calls.metadata.rules` (ship_path, drops, auto_fixes, anchor_shipped, recent_min_diff). B2 ✅ (`03fdf13`, 2026-06-12) — injector pool hygiene (fullPool + rain-aware outerwear, preset/metal-aware shared picker, belt-preference for belt-friendly dresses), dead vars removed. B3 ✅ (`e3f59af`, 2026-06-12) — deferred soft drops (admitSoft now hard-clean only), bounded regenerate-with-feedback before fallbacks (runValidation/buildOutfit refactor), emergency fallback re-checks rain/dressy-bans/metal-sync/presets/drop-side-moods/bag-size + gender-gated work mirrors, safety net gated by isStructurallyComplete (honest empty + ai_error when nothing sound), `relaxed` surfaced on the results card (EN/FR). B4 ✅ (`334e7f6`, 2026-06-12) — cache-first prompt layout (rules+contract in prefix before wardrobe; favorites moved to suffix; byte-stability verified), rule text extracted to `src/lib/suggest-prompt.ts` with the §6 content fixes (renumbering, brunch-heel contradiction, all-black slot leftover, dead refs, merged warm bands), new 10–14°C warmth gate, Paris default → IP-geo → honest none (+`weather_source` telemetry), dead `outfit-engine.ts` deleted + CLAUDE.md corrected. **GROUP B COMPLETE.** Remaining B follow-up (deferred): fully config-driven validator/prompt derivation; trimming twin-enforced prompt rules (~3k tokens) once the Phase 6 harness can A/B the effect.**
1. **B1 Telemetry + cheap validators** (no behavior change to happy path): persist per-rule drop/fix data into `ai_calls.metadata` (the `_fixes` trail is already computed and discarded); add missing validators — anchor-item-present, recent-set ≥2-item distance, `mood=period`, tank-top at work, Track-A open-toe at work, French hallucination-words list; run refine output through the existing text guards.
2. **B2 Injector hygiene:** all injectors draw from the pre-filtered pool only; injected items re-validated (metal-sync/preset-aware); fix accessory-injector comment-vs-code (`:1924`) and prefer-belt-when-completer-will-demand-one; fix `wardrobeHasOuterwear` dead var et al.
3. **B3 Fallback ladder restructure:** move the 3 mid-filter soft drops to the end (kills the admitSoft-skips-hard-rules class); **one bounded regenerate-with-violations re-prompt** before any fallback; emergency fallback re-checks the full hard-rule list (from B4's config — interim: add the worst gaps: rain, moods, dressy bans, metal sync, gender gates); kill SAFETY-NET layer 2 raw ship (require structural minimum + occasion bans) and surface `relaxed` to the client (ties into Phase 8 rec #2).
4. **B4 Single source of truth:** extract declarative rules config; derive prompt rule-block, validator chain, fallback mirror, and e2e validator from it; prompt restructure per `.audit/p2-prompt-audit.md` §6 (cache layout fix = biggest latency/cost win, renumbering, menswear as separate template, delete twin-enforced prompt rules); delete dead `outfit-engine.ts` + correct CLAUDE.md; fix warmth 12–18°C gap + Paris-default fallback (use IP-geo like `/api/weather`, or skip warmth gates with a wardrobe_gap note).

### Group C — P1/P2 functional bugs (~2–3 days)
1. Safe-area insets app-wide (viewportFit + shared chrome + sticky headers); manifest background_color.
2. Error-vs-empty states on home/wardrobe/suggest/outfits/profile + retry affordance; weather-widget unreachable error state (+ stale closure).
3. False-success group: suggest favorite, settings save, onboarding finish (+ keep answers on failure), wear-today/delete/bulk ops respond to status; double-tap guards.
4. Caps: don't burn quota on failures (validate before incr; refund on 5xx); add cap to `analyze`; extend admin bypass to try-on/packing; KV fail-open → log loudly (keep fail-open).
5. `today` route: transaction-ize log+counter, archive-before-overwrite at midnight rollover, FK-violation surfacing; local-day handling for caps/labels/share-image/packing-forecast/trips (decide: user-local day from client tz header).
6. Upload pipeline: timeout actually cancels work (AbortController through the chain); normalize failure falls back to raw image; delete/replace removes storage objects; HEIC conversion on change-photo; `addFiles` overflow feedback; remove dead imgly preload (~45MB).
7. Sentry: capture handled AI-route failures; fix refine telemetry feature tag; `waitUntil` for logAiCall.
8. Auth UX: render OAuth `error` param; `pageshow` reset for the Google button; password-input padding fix.

### Group D — i18n (~1 day)
1. Hardcoded-string sweep into dictionaries (review page, upload strip/tiles, bulk page, FAB tips, home/outfits leftovers, aria-labels) — keys exist for some (e.g. `heicReadFailed`).
2. Auth/API error mapping to localized messages (login/signup/try-on/packing).
3. `lang` attribute follows locale; date formatting via locale; try-on locale plumb-through; fr fixes (`item(s)`, duplicate `suggest.styling` key, FAQ FR drift).

### Group E — A11y/polish (~1 day)
Tap-target pass (shared Button + icon buttons), aria-labels, `aria-current` on nav, dialog focus/labels, re-enable pinch zoom, contrast tweaks, alert()/confirm() → dialog component, navigation trap on privacy/terms, packing dropdown/delete-confirm, splash reduced-motion + skip.

### Phase 6 — Rule-compliance harness (after Group B)
1. Convert `stress-suggest.spec.ts` from report-only to enforcement: per-rule `expect()` with thresholds, sourcing rule definitions from B4's config (kills the drift between server rules and test re-implementation).
2. Synthetic-wardrobe fixtures designed to tempt violations (the over-constraint W1–W3 scenarios from `.audit/p2-overconstraint.md` become test cases), incl. over-constrained wardrobes asserting graceful handling.
3. Debug mode: `?debug=rules` (admin-gated) returns the per-outfit rule-check log (which rules ran/passed/failed/fixed) — diagnosable in seconds; backed by the B1 telemetry.
4. Test-user hygiene: the audit created `e2e-audit-claude@linette.app` (id `1050bf5f-…`); either adopt it for CI (onboard it + seed a fixture wardrobe) or delete it.

### Standing notes
- Two collaborators on the repo: `git pull --rebase` before any push (CLAUDE.md rule).
- Nothing in this plan deletes user data or runs destructive migrations. The `ai_calls` RLS `with check (true)` fix and dead-column drops (`sunglasses_style`, `jewelry_scale`, `belt_compatible`, `rain_appropriate`) are **proposed migrations — will ask before applying anything to the DB**.
- `playwright.audit.config.ts` (port-3001 audit variant) and `.audit/` are working artifacts — say if you want them gitignored, committed, or removed when done.
