# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # Next dev (Turbopack). Disables TLS reject — local Supabase mTLS.
npm run build            # Production build. Vercel runs this on every push to main.
npm run lint             # ESLint (next/core-web-vitals base).
npm run typecheck        # next typegen + tsc --noEmit (works on a fresh clone without .next)
npm run typecheck:ts7    # same check on TypeScript 7's native compiler (the project stays on 6 for typescript-eslint)
npm run test:unit        # Vitest: pure logic in src/**/*.test.ts (text guards, Gemini helpers, weather, sanitizer, Sentry baseline)

# Playwright e2e — needs STRESS_TEST_EMAIL + STRESS_TEST_PASSWORD in .env.local.
# Tests are serial (workers: 1) because they share one test user.
npm run test:smoke       # ui-smoke + stress-crud (no AI calls)
npm run test:stress      # everything (CRUD + suggest + try-on + packing + wear-today)
npm run test:stress:fast # CRUD + wear-today only
npm run test:stress:ai   # AI endpoints only (suggest, try-on, packing)
npm run test:rules       # rule-compliance harness: HARD-fails on any rule-breaking outfit
# Single spec: npx playwright test tests/e2e/<file>.spec.ts
```

`test:rules` wipes and reseeds the wardrobe of a DEDICATED account: set `HARNESS_EMAIL` (must contain "e2e" or "harness") and put that email in `CAP_BYPASS_EMAILS` for the dev server. No password needed: without `HARNESS_PASSWORD` the harness signs in through the Supabase admin API (`tests/e2e/harness-session.ts`). Never point any e2e run at a real person's account: every spec signs in through `tests/e2e/auth.ts`, which refuses an email without "e2e" or "harness". `HARNESS_SUGGEST_RETRY_MINUTES=N` makes the rules harness retry suggest's 5xx (Gemini overload, free-tier cap) once a minute. Next 16 allows one `next dev` per folder: when one already runs, test against a production build (`next start -p <port>`).

`npm run typecheck` runs `next typegen` first because `next-env.d.ts` imports the generated route types from `.next/types`; `next build` also type-checks. **Re-run it after touching any third-party component prop** (the dev compile is more lenient than the production build).

CI (`.github/workflows/ci.yml`, GitHub Actions, Node 24) runs typecheck (TypeScript 6 and TypeScript 7), lint and the unit tests on every push to main and every pull request. It needs no secrets; the Playwright suites need the e2e account and a server, so they stay manual. Add a unit test next to any pure helper you change.

## High-level architecture

**Linette** is a Next.js 16 PWA (App Router, React 19, Turbopack, React Compiler on via `reactCompiler: true` + `babel-plugin-react-compiler`) for AI-assisted wardrobe styling. Auth + persistence on Supabase, rate-limit counters on Upstash Redis (the Vercel KV store, through `kv()` in `src/lib/kv.ts`), AI via Google Gemini, background removal self-hosted, hosted on Vercel (region `pdx1`, next to Supabase us-west-2).

### Request lifecycle for AI endpoints

Every AI endpoint (`/api/suggest`, `/api/suggest/refine`, `/api/try-on`, `/api/items/analyze`, `/api/packing`) follows the same shape:

1. **Auth gate**: `await requireUser()` from `src/lib/supabase/require-user.ts` returns `{ supabase, userId }` or a `NextResponse` to return early. Always check with `isNextResponse(ctx)`.
2. **Daily-cap gate**: KV counter at `<endpoint>_count:<userId>:<YYYY-MM-DD>` through `consumeDailyCap` / `refundDailyCap` in `src/lib/daily-cap.ts` (Upstash `kv()`), expired after 36h on first hit. Caps are intentionally low; see `*_DAILY_CAP` constants at the top of each route. Refund the use whenever the user got nothing.
3. **Gemini call**: `withModelFallback(QUALITY_MODELS | FAST_MODELS, (m) => ..., { tag })` from `src/lib/gemini-retry.ts`. It retries each model through `withGeminiRetry` and moves to the next one on a 503 (overloaded) or 429 (quota, the free tier's day cap included). Model IDs live ONLY in `src/lib/gemini.ts` — never hard-code one in a route. Take thinking settings from `thinkingFor(m, "suggest" | "none")` and record the model that answered in the `logAiCall` metadata. Two tiers, picked by quality-sensitivity, not preference:
   - `QUALITY_MODEL` (`gemini-3.6-flash`) — suggest, suggest/refine, try-on outfit simulation. `QUALITY_MODELS` = it, then `gemini-3.5-flash-lite` (verified as the outfit model: harness 8/8, sweep 61/61; it skips some soft stylist instructions 3.6 follows). `GEMINI_QUALITY_MODEL` overrides the first model without a deploy. 3.6 at thinking level LOW beat the newer `gemini-3.8-flash` on a real wardrobe (2026-10-16): 6-9 s with real reasoning, where 3.8 thinks nothing at LOW and takes 15-81 s at MEDIUM. Numbers in `gemini.ts`.
   - `FAST_MODEL` (`gemini-3.5-flash-lite`) — analyze, try-on item read, packing. Sanitizer-protected. `FAST_MODELS` = it, then the quality model (tags photos as well, ~2x the cost, only on fallback).
   - Thinking goes through `thinkingFor`. Suggest on Flash sends a thinking LEVEL, `GEMINI_SUGGEST_THINKING_LEVEL` (low | medium | high, default LOW): Gemini 3 Flash accepts `thinkingBudget` but ignores it as a cap (3.6 thought ~2,700 tokens at budget 1024 and 3072 alike, 3.8 thought zero), and latency is thinking-bound (~200 tokens/s). "none" on Flash is `thinkingBudget: 0`. Flash-Lite takes `thinkingLevel` (MEDIUM for suggest, MINIMAL otherwise) and rejects `thinkingBudget` with an HTTP 400; 3.8-flash rejects MINIMAL. Suggest's `?debug=rules` and `ai_calls.metadata.calls` record each call's time and thinking tokens.
4. **Parse, then sanitize output**: wrap the call in `withParseRetry(() => withModelFallback(...), parse)` (same file; `parseJsonObject` pulls the first `{...}` block) so an answer that can't be parsed is asked again once instead of failing the request. Never trust raw model output: `sanitizeAutoFill` (analyze), enum allowlists, and the deterministic strips inside `suggest/route.ts` exist because models return close-but-invalid values that fail Supabase check constraints.
5. **Log the call**: `logAiCall(supabase, userId, "<tag>", { metadata, succeeded })` writes to the `ai_calls` table. Always called — both on success and in the catch block.

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

Self-hosted since 2026-10-15 (Photoroom was cancelled): `cutoutToCatalogJpeg` in `src/lib/cutout/` runs BiRefNet-lite (MIT) on `onnxruntime-node`, then blur-fusion edge cleanup (`matte.ts`) and catalog framing: 1280×1280 white JPEG, item centered with 8% padding. Matched Photoroom at 98% mean mask IoU on real wardrobe photos.

The ONNX file is our own export, `scripts/cutout/export_birefnet_lite_lean.py` (reproducible byte for byte). The stock export peaks near 6 GB per 1024 px run and a Vercel function had 2 GB on the Standard size (every photo was killed for out-of-memory on the first preview). Ours rewrites the deformable convs and two full-resolution concats so it computes the same masks (100% IoU against the PyTorch model) at ~1.3 GB. It lives in the project's Vercel Blob store (content-addressed URL + sha256 in `model.ts`), downloads once per instance into `/tmp`, and the session is created from that file path. Keep `graphOptimizationLevel: "all"` and the CPU arena off: other settings peaked at 2-3.7 GB. Photos are cut out one at a time per instance, decode to JPEG (`oneAtATime` in `src/lib/cutout/`): Fluid compute sends a bulk upload's concurrent photos to one instance and the model keeps its vCPU busy, so normalize's `maxDuration` is 300 s for the queued ones. Functions run on Vercel's Performance size since 2026-10-17 (2 vCPU / 4 GB, project-wide in Settings → Functions, the owner's call): a warm cutout takes ~12 s (~21 s on Standard's one vCPU). Keep any model's peak under 2 GB anyway, so switching back to Standard can't break uploads. `vercel.json`'s `installCommand` (and CI's env) set `ONNXRUNTIME_NODE_INSTALL=skip` so onnxruntime skips its CUDA download (the old `.npmrc` key is deprecated: npm warns it stops working in npm's next major), and `next.config.ts` traces only the linux-x64 binaries into the normalize function. If the cutout fails or finds no item, the route falls back to a plain resize so an upload never dies on it.

### Outfit composition (suggest/route.ts)

Hybrid pipeline, not a pure LLM call:

1. **Deterministic pre-filter** (inline `passesWarmth` + tag/formality filters in `suggest/route.ts`): temperature bands strip warmth-inappropriate items before the model sees the wardrobe. (The old `outfit-engine.ts` was dead code — deleted 2026-06; all live rules are in the route.)
2. **LLM composition**: model picks IDs from the filtered set.
3. **Post-strips and repairs**: BELT STRIP, accessory-injection guards, and other R-prefixed rules clean up the chosen IDs. **Critical**: any "strip + re-inject" loop is a bug magnet — when adding an injector, check it respects all upstream strip predicates (e.g. `baseBlocksBelt`, the subcategory dedupe). Repairs fix one bad piece instead of dropping the outfit (each drop costs a second ~6-15 s Gemini call): BASE COMPLETER (the missing top or bottom), COAT REPAIR (a coat the rain refuses), SHOE REPAIR (a shoe that breaks a shoe rule). They fall back to `promptItems` when the shoe rotation or the freshness ban hid the only piece that passes, and record what they swapped out so `textMentionsSwappedOut` can send an AI sentence that still names it to the template.
4. **Validators, regenerate, fallback ladder**: hard drops, one regenerate-with-feedback call, then the emergency fallback gate (`isStructurallyComplete`) and the response-edge checks.

**One predicate per rule.** The rules that the injectors, the validators and the fallback gate all apply live ONCE, hoisted above `buildOutfit`: `beltBlockedBy` / `baseBlocksBelt` (Rule 18a, a wrap tie counts as the belt), `hatProblem` (hat × occasion), `shoeFitsContext`, `bagOkForInjection` (+ `wardrobeHasFormalBag` / `wardrobeHasSmallFormalBag`), `accessoryFitsWeather`, `isBannedWorkSneaker`, `isOpenShoe`, `rainRefuses` / `rainWorthy` (rain materials and outdoor shoes, refused only while a rain-worthy alternative exists for that slot), `casualWearBan` (shorts / sweatpants / leggings / hoodies at dressy occasions; also hides them from the prompt when the slot has an allowed piece), `baseTooLight` / `lightBottom` (cold-weather base warmth floor; light non-skirt bottoms hidden from the prompt when a warm-enough one exists), `patternEchoOffender` (statement prints once per outfit; shoe logos and stripes don't count). Copies drifted before (the completer demanded the belt the strip had removed). Prompt text in `src/lib/suggest-prompt.ts` must say exactly what the code enforces. Hard rules that could empty a small wardrobe are wardrobe-aware: they only fire when the user owns an item that passes them. "Owns" means wearable in THIS request: mood rules, R8 dressy fabric and the user-tag rule count `moodPool` (the pool the model saw, filtered by `wearableHere`), never the whole wardrobe. A wardrobe-level check is how "Couldn't put together a look" happened (2026-10-16).

Menswear has a `MENSWEAR OVERRIDES` block in the prompt; the deterministic code gender-gates the rules that differ by track (work jeans and sneakers, bag optional, belt only with a tucked shirt, no tights, metal-sync bag visibility, no R8 silk / satin / velvet ask on dates).

### i18n

`src/lib/i18n/` — JSON dictionaries for `en` and `fr`, `use-labels` / `use-locale` hooks. Locale flows into AI prompts via a `LANGUAGE:` directive at the end of `dynamicSuffix` so the model writes its free-text fields (reasons, notes, summaries) in the user's language while keeping item IDs stable. French is always the informal "tu": `textGuardReason` (`src/lib/suggest-text-guards.ts`, shared by suggest and refine) rejects AI prose in "vous", with stripped accents, garbled characters, or naming a garment the outfit doesn't have; suggest falls back to its template, refine re-asks once and logs the reason. Mind compounds when adding words to those checks ("rendez-vous" contains "vous").

### PWA service worker

`public/sw.js` is intentionally a **pass-through** SW — install + activate + empty fetch handler. Its only job is to exist so Chrome treats the app as installable. It caches nothing. Don't add caching here without a deliberate decision; the staleness bugs caching introduces (users on old UI after a deploy, hot-reload breakage) outweigh offline support for this app.

### Launch splash

`src/components/launch-splash.tsx` renders once per session (sessionStorage `linette_splash_seen` gate; an inline script in `layout.tsx` adds `.skip-splash` to `<html>` to hide it instantly on return). The wordmark is a Lottie animation (`src/assets/linette-lottie.json`) played via `lottie-react` 3: the named `{ Lottie }` export with `src`, `speed`, `loop`, `autoplay` and `rendererSettings` props (2.x had a default export, `animationData`, and speed set through a ref in `onDOMLoaded`).

### Sentry

Init lives in `src/instrumentation.ts` (node + edge) and `src/instrumentation-client.ts` (browser). **They must stay inside `src/`** — this project uses a src folder, so Next.js ignores these convention files at the repo root. They sat at the root for 43 days and Sentry silently captured nothing (captureException still returns an event ID when the SDK never initialized, so nothing looked broken). Browser events tunnel through `/monitoring` (see `tunnelRoute` in next.config.ts), which must stay in the middleware PUBLIC_PATHS. **@sentry/nextjs 11 collects far more by default** (cookies with the Supabase session token, user info and IP, request bodies, Gemini prompts, stack-frame variables): every `Sentry.init` passes `dataCollection: SENTRY_DATA_COLLECTION` from `src/lib/sentry-data-collection.ts`, which keeps the v10-era privacy level. A new init without it would leak those.

### Auth + admin

- `src/lib/supabase/require-user.ts` — the single auth gate. Use everywhere a route needs a logged-in user.
- `src/lib/supabase/server.ts` / `client.ts` — SSR vs. browser clients.
- `src/lib/admin-bypass.ts` — caps + paywalls skip for `ADMIN_EMAIL` / `CAP_BYPASS_EMAILS`; check `isCapBypassed(ctx.userEmail, ctx.userEmailConfirmed)` before applying gates if you add new ones. The email must be confirmed, so nobody can claim an allowlisted address by signing up with it.
- CRUD routes parse bodies with `readJsonObject` (`src/lib/read-json.ts`, bad JSON → 400) and answer database errors with `dbErrorResponse` (`src/lib/db-error.ts`): an unknown column, a malformed id or date, or a failed constraint is the caller's mistake (400), anything else is a 500.

## Deploy

Vercel auto-deploys on push to `main`. Production domain: `linette.app`. There are two collaborators on the repo, so **`git pull --rebase` before pushing** — this is a standing rule. Vercel's build runs `next build` which includes TS type-checking; a passing local `npx tsc --noEmit` is necessary but not sufficient.

`next.config.ts` `headers()` sends a baseline on every response: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, a framing-only CSP (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) and a `Permissions-Policy` that keeps `geolocation=(self)` (weather, onboarding and settings ask for the position). No script CSP on purpose: inline Next bootstrap, the Sentry tunnel, Supabase, Stripe redirects and blob: previews would all need allowances. Node is pinned to 24.x (`engines`, the Vercel project setting).

`vercel.json` pins functions to `pdx1` and runs a daily cron on `/api/cron/keepalive` (a one-row Supabase read, guarded by `CRON_SECRET`), so the free Supabase project never hits its 7-day idle pause. `CRON_SECRET` must exist in the Vercel production env. It is a sensitive variable (unreadable), so test the authorized path with `vercel crons run /api/cron/keepalive` (Vercel sends the real secret; expect 200 in `vercel logs`), not from outside.

Line endings: `core.autocrlf=true` checks files out as CRLF. Edit tools that match multi-line strings can fail on a CRLF file; an unmodified file can be re-checked-out as LF with `git -c core.autocrlf=false checkout-index --force -- <file>` (git's own copy is LF, the diff stays empty).

## Conventions worth knowing

- **Prompt strings live with their route**, not in a shared prompts dir, except `analyze-prompt.ts` (reused between the legacy multipart and the URL-fetch paths).
- **Daily caps are tier-bands**, not free-floating numbers. The framework is Conservative / Balanced / Generous — current beta runs Balanced. Pricing tier changes follow the same bands.
- **Brand**: the damask texture is scoped to "lobby + share" surfaces (auth, onboarding, launch, generated outfit-share images). Don't add it to daily-use views — it competes with item photos.
- **AI cost matters more than you'd think.** At current pricing, a max-cap Linette-tier user can cost more in AI than they pay in subscription. Don't add new AI endpoints without a daily cap and a cost estimate.
- **Dependencies**: `npm audit --omit=dev` was clean on 2026-10-16 (what remains is dev tooling: the lint plugin and the shadcn CLI, through a glob library with no fixed release). `sharp` stays exact-pinned: it decodes every uploaded photo, so its libvips security releases come first, and after any bump check that the cutouts still match (production's output was byte-identical across 0.34.5 → 0.35.5). `shadcn` is a devDependency (a CLI; `globals.css` imports its CSS at build time). A release younger than a week needs a verified registry signature or provenance attestation first (`npm audit signatures`); `eslint-config-next` moves in lockstep with `next`. On 2026-10-16 every dependency was moved to its current major and verified (Next 16.4.2, TypeScript 6.0, Sentry 11, Stripe 23 / API `2026-09-30.endive`, react-day-picker 10, lottie-react 3, dotenv 18, opentype.js 2, React Compiler). Two exceptions, both on evidence: the project's TypeScript stays 6.0.3 because typescript-eslint (inside `eslint-config-next`) throws "typescript-eslint does not support TS 7.0" (tested 2026-10-16; latest and canary both declare `<6.1.0`), while the code itself is TS 7-clean and CI checks it with TypeScript 7's native compiler on every push (`npm run typecheck:ts7`; Next 16's build already uses the `tsc` CLI, which supports 7). Switch when typescript-eslint supports 7. `@types/node` stays on the runtime's major (24). Install scripts: current npm skips dependency install scripts unless `package.json`'s `allowScripts` approves them, and it denies all five we have (none is needed). When `npm install` lists a new one, review it, then `npm install-scripts approve <pkg>` or `deny <pkg>`.
