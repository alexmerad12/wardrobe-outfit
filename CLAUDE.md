# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # Next dev (Turbopack). Disables TLS reject — local Supabase mTLS.
npm run build            # Production build. Vercel runs this on every push to main.
npm run lint             # ESLint (next/core-web-vitals base).

# Playwright e2e — needs STRESS_TEST_EMAIL + STRESS_TEST_PASSWORD in .env.local.
# Tests are serial (workers: 1) because they share one test user.
npm run test:smoke       # ui-smoke + stress-crud (no AI calls)
npm run test:stress      # everything (CRUD + suggest + try-on + packing + wear-today)
npm run test:stress:fast # CRUD + wear-today only
npm run test:stress:ai   # AI endpoints only (suggest, try-on, packing)
npm run test:rules       # rule-compliance harness: HARD-fails on any rule-breaking outfit
# Single spec: npx playwright test tests/e2e/<file>.spec.ts
```

`test:rules` wipes and reseeds the wardrobe of a DEDICATED account: set `HARNESS_EMAIL` (must contain "e2e" or "harness") and put that email in `CAP_BYPASS_EMAILS` for the dev server. No password needed: without `HARNESS_PASSWORD` the harness signs in through the Supabase admin API (`tests/e2e/harness-session.ts`). Never point any e2e run at a real person's account.

There's no `tsc` script; `next build` runs TypeScript as part of the build. Run `npx tsc --noEmit` for a standalone check — **and re-run it after touching any third-party component prop** (the dev compile is more lenient than the production build).

## High-level architecture

**Linette** is a Next.js 16 PWA (App Router, React 19, Turbopack) for AI-assisted wardrobe styling. Auth + persistence on Supabase, rate-limit counters on Upstash Redis (the Vercel KV store, through `kv()` in `src/lib/kv.ts`), AI via Google Gemini, background removal self-hosted, hosted on Vercel (region `pdx1`, next to Supabase us-west-2).

### Request lifecycle for AI endpoints

Every AI endpoint (`/api/suggest`, `/api/suggest/refine`, `/api/try-on`, `/api/items/analyze`, `/api/packing`) follows the same shape:

1. **Auth gate**: `await requireUser()` from `src/lib/supabase/require-user.ts` returns `{ supabase, userId }` or a `NextResponse` to return early. Always check with `isNextResponse(ctx)`.
2. **Daily-cap gate**: KV counter at `<endpoint>_count:<userId>:<YYYY-MM-DD>` through `consumeDailyCap` / `refundDailyCap` in `src/lib/daily-cap.ts` (Upstash `kv()`), expired after 36h on first hit. Caps are intentionally low; see `*_DAILY_CAP` constants at the top of each route. Refund the use whenever the user got nothing.
3. **Gemini call**: wrap in `withGeminiRetry(() => ..., { tag })` from `src/lib/gemini-retry.ts`. Model IDs live ONLY in `src/lib/gemini.ts` — never hard-code one in a route. Two tiers, picked by quality-sensitivity, not preference:
   - `QUALITY_MODEL` (`gemini-3.6-flash`) — suggest, suggest/refine, try-on outfit simulation. Uses `thinkingBudget` (`SUGGEST_THINKING` / `NO_THINKING`). `GEMINI_QUALITY_MODEL` overrides it without a deploy (outage, or the free-tier day cap while testing; e.g. `gemini-2.5-flash`).
   - `FAST_MODEL` (`gemini-3.5-flash-lite`) — analyze, try-on item read, packing. Sanitizer-protected. It REJECTS `thinkingBudget` (HTTP 400): use `FAST_THINKING` (`thinkingLevel: MINIMAL`).
4. **Sanitize output**: never trust raw model output. `sanitizeAutoFill` (analyze), enum allowlists, and the deterministic strips inside `suggest/route.ts` exist because models return close-but-invalid values that fail Supabase check constraints.
5. **Log the call**: `logAiCall(supabase, userId, "<tag>", { metadata, succeeded })` writes to `ai_call_logs`. Always called — both on success and in the catch block.

### Prompt-cache discipline (suggest endpoint)

Gemini caches byte-identical prefixes. The suggest route splits its prompt into `cachedPrefix` (wardrobe + user profile, stable across taps) and `dynamicSuffix` (weather, occasion, recent outfits — grows per tap). Anything that varies per request **must** live in the suffix; putting growing content in the prefix breaks caching and compounds latency on each "Show me another" tap.

### Image upload path

Phone photos blow Vercel's 4.5 MB request body limit even after client-side downscale. The pattern:

1. Client uploads the original to Supabase Storage (`clothing-images/<userId>/...`).
2. Client sends `{ sourcePath }` JSON to `/api/items/normalize` and `/api/items/analyze`.
3. The API downloads it through `downloadOwnedPhoto` (`src/lib/owned-photo.ts`): the path must start with the caller's user id, and the server never fetches an arbitrary URL (a `sourceUrl` is accepted only when it is that bucket's public URL for the caller's own folder).
4. Analyze runs `sharp` (rotate by EXIF, resize to 1024px, JPEG q80) and sends base64 inline to Gemini.

Legacy multipart upload still works on the analyze path. Both branches converge to the same `sharp` pipeline.

### Background removal (`/api/items/normalize`)

Self-hosted since 2026-10-15 (Photoroom was cancelled): `cutoutToCatalogJpeg` in `src/lib/cutout/` runs BiRefNet-lite (MIT, fp16 ONNX, pinned HF commit + sha256 in `model.ts`) on `onnxruntime-node`, then blur-fusion edge cleanup (`matte.ts`) and catalog framing: 1280×1280 white JPEG, item centered with 8% padding. Matched Photoroom at 98% mean mask IoU on real wardrobe photos. The model downloads once per instance into `/tmp` (verified by sha256); `.npmrc` skips onnxruntime's CUDA download and `next.config.ts` traces only the linux-x64 binaries into the normalize function. If the cutout fails or finds no item, the route falls back to a plain resize so an upload never dies on it.

### Outfit composition (suggest/route.ts)

Hybrid pipeline, not a pure LLM call:

1. **Deterministic pre-filter** (inline `passesWarmth` + tag/formality filters in `suggest/route.ts`): temperature bands strip warmth-inappropriate items before the model sees the wardrobe. (The old `outfit-engine.ts` was dead code — deleted 2026-06; all live rules are in the route.)
2. **LLM composition**: model picks IDs from the filtered set.
3. **Post-strips**: BELT STRIP, accessory-injection guards, and other R-prefixed rules clean up the chosen IDs. **Critical**: any "strip + re-inject" loop is a bug magnet — when adding an injector, check it respects all upstream strip predicates (e.g. `baseBlocksBelt`).
4. **Validators, regenerate, fallback ladder**: hard drops, one regenerate-with-feedback call, then the emergency fallback gate (`isStructurallyComplete`) and the response-edge checks.

**One predicate per rule.** The rules that the injectors, the validators and the fallback gate all apply live ONCE, hoisted above `buildOutfit`: `beltBlockedBy` / `baseBlocksBelt` (Rule 18a, a wrap tie counts as the belt), `hatProblem` (hat × occasion), `shoeFitsContext`, `bagOkForInjection` (+ `wardrobeHasFormalBag` / `wardrobeHasSmallFormalBag`), `accessoryFitsWeather`, `isBannedWorkSneaker`, `isOpenShoe`. Copies drifted before (the completer demanded the belt the strip had removed). Prompt text in `src/lib/suggest-prompt.ts` must say exactly what the code enforces. Hard rules that could empty a small wardrobe are wardrobe-aware: they only fire when the user owns an item that passes them.

Menswear has a `MENSWEAR OVERRIDES` block in the prompt; the deterministic code gender-gates the rules that differ by track (work jeans and sneakers, bag optional, belt only with a tucked shirt, no tights, metal-sync bag visibility).

### i18n

`src/lib/i18n/` — JSON dictionaries for `en` and `fr`, `use-labels` / `use-locale` hooks. Locale flows into AI prompts via a `LANGUAGE:` directive at the end of `dynamicSuffix` so the model writes its free-text fields (reasons, notes, summaries) in the user's language while keeping item IDs stable.

### PWA service worker

`public/sw.js` is intentionally a **pass-through** SW — install + activate + empty fetch handler. Its only job is to exist so Chrome treats the app as installable. It caches nothing. Don't add caching here without a deliberate decision; the staleness bugs caching introduces (users on old UI after a deploy, hot-reload breakage) outweigh offline support for this app.

### Launch splash

`src/components/launch-splash.tsx` renders once per session (sessionStorage `linette_splash_seen` gate; an inline script in `layout.tsx` adds `.skip-splash` to `<html>` to hide it instantly on return). The wordmark is a Lottie animation (`src/assets/linette-lottie.json`) played via `lottie-react`. **Note**: `lottie-react`'s `<Lottie>` has no `speed` prop — set speed imperatively via `lottieRef.current.setSpeed()` in an `onDOMLoaded` callback.

### Sentry

Init lives in `src/instrumentation.ts` (node + edge) and `src/instrumentation-client.ts` (browser). **They must stay inside `src/`** — this project uses a src folder, so Next.js ignores these convention files at the repo root. They sat at the root for 43 days and Sentry silently captured nothing (captureException still returns an event ID when the SDK never initialized, so nothing looked broken). Browser events tunnel through `/monitoring` (see `tunnelRoute` in next.config.ts), which must stay in the middleware PUBLIC_PATHS.

### Auth + admin

- `src/lib/supabase/require-user.ts` — the single auth gate. Use everywhere a route needs a logged-in user.
- `src/lib/supabase/server.ts` / `client.ts` — SSR vs. browser clients.
- `src/lib/admin-bypass.ts` — caps + paywalls skip for `ADMIN_EMAIL` / `CAP_BYPASS_EMAILS`; check `isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed)` before applying gates if you add new ones. The email must be confirmed, so nobody can claim an allowlisted address by signing up with it.
- CRUD routes parse bodies with `readJsonObject` (`src/lib/read-json.ts`, bad JSON → 400) and answer database errors with `dbErrorResponse` (`src/lib/db-error.ts`): an unknown column, a malformed id or date, or a failed constraint is the caller's mistake (400), anything else is a 500.

## Deploy

Vercel auto-deploys on push to `main`. Production domain: `linette.app`. There are two collaborators on the repo, so **`git pull --rebase` before pushing** — this is a standing rule. Vercel's build runs `next build` which includes TS type-checking; a passing local `npx tsc --noEmit` is necessary but not sufficient.

`vercel.json` pins functions to `pdx1` and runs a daily cron on `/api/cron/keepalive` (a one-row Supabase read, guarded by `CRON_SECRET`), so the free Supabase project never hits its 7-day idle pause. `CRON_SECRET` must exist in the Vercel production env.

Line endings: `core.autocrlf=true` checks files out as CRLF. Edit tools that match multi-line strings can fail on a CRLF file; an unmodified file can be re-checked-out as LF with `git -c core.autocrlf=false checkout-index --force -- <file>` (git's own copy is LF, the diff stays empty).

## Conventions worth knowing

- **Prompt strings live with their route**, not in a shared prompts dir, except `analyze-prompt.ts` (reused between the legacy multipart and the URL-fetch paths).
- **Daily caps are tier-bands**, not free-floating numbers. The framework is Conservative / Balanced / Generous — current beta runs Balanced. Pricing tier changes follow the same bands.
- **Brand**: the damask texture is scoped to "lobby + share" surfaces (auth, onboarding, launch, generated outfit-share images). Don't add it to daily-use views — it competes with item photos.
- **AI cost matters more than you'd think.** At current pricing, a max-cap Linette-tier user can cost more in AI than they pay in subscription. Don't add new AI endpoints without a daily cap and a cost estimate.
