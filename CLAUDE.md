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
# Single spec: npx playwright test tests/e2e/<file>.spec.ts
```

There's no `tsc` script; `next build` runs TypeScript as part of the build. Run `npx tsc --noEmit` for a standalone check — **and re-run it after touching any third-party component prop** (the dev compile is more lenient than the production build).

## High-level architecture

**Linette** is a Next.js 16 PWA (App Router, React 19, Turbopack) for AI-assisted wardrobe styling. Auth + persistence on Supabase, rate-limit counters on Vercel KV, AI via Google Gemini, hosted on Vercel.

### Request lifecycle for AI endpoints

Every AI endpoint (`/api/suggest`, `/api/suggest/refine`, `/api/try-on`, `/api/items/analyze`, `/api/packing`) follows the same shape:

1. **Auth gate**: `await requireUser()` from `src/lib/supabase/require-user.ts` returns `{ supabase, userId }` or a `NextResponse` to return early. Always check with `isNextResponse(ctx)`.
2. **Daily-cap gate**: KV counter at `<endpoint>_count:<userId>:<YYYY-MM-DD>`, incremented with `kv.incr`, expired after 36h on first hit. Caps are intentionally low; see `*_DAILY_CAP` constants at the top of each route.
3. **Gemini call**: wrap in `withGeminiRetry(() => ..., { tag })` from `src/lib/gemini-retry.ts`. Two model tiers in use — pick based on quality-sensitivity, not preference:
   - `gemini-3.5-flash` — suggest, suggest/refine, try-on. Quality-sensitive endpoints where prompt drift breaks UX.
   - `gemini-3-flash-preview` — analyze, packing. Cheaper (~3× lower cost) but sanitizer-protected or rare-use.
4. **Sanitize output**: never trust raw model output. `sanitizeAutoFill` (analyze), enum allowlists, and the deterministic strips inside `suggest/route.ts` exist because models return close-but-invalid values that fail Supabase check constraints.
5. **Log the call**: `logAiCall(supabase, userId, "<tag>", { metadata, succeeded })` writes to `ai_call_logs`. Always called — both on success and in the catch block.

### Prompt-cache discipline (suggest endpoint)

Gemini caches byte-identical prefixes. The suggest route splits its prompt into `cachedPrefix` (wardrobe + user profile, stable across taps) and `dynamicSuffix` (weather, occasion, recent outfits — grows per tap). Anything that varies per request **must** live in the suffix; putting growing content in the prefix breaks caching and compounds latency on each "Show me another" tap.

### Image upload path

Phone photos blow Vercel's 4.5 MB request body limit even after client-side downscale. The pattern:

1. Client uploads original to Supabase Storage via signed URL.
2. Client sends `{ sourceUrl }` JSON to the API.
3. API fetches from Supabase, runs `sharp` (rotate by EXIF, resize to 1024px, JPEG q80), sends base64 inline to Gemini.

Legacy multipart upload still works on the single-add path. Both branches converge to the same `sharp` pipeline.

### Outfit composition (suggest/route.ts)

Hybrid pipeline, not a pure LLM call:

1. **Deterministic pre-filter** (inline `passesWarmth` + tag/formality filters in `suggest/route.ts`): temperature bands strip warmth-inappropriate items before the model sees the wardrobe. (The old `outfit-engine.ts` was dead code — deleted 2026-06; all live rules are in the route.)
2. **LLM composition**: model picks IDs from the filtered set.
3. **Post-strips**: BELT STRIP, accessory-injection guards, and other R-prefixed rules clean up the chosen IDs. **Critical**: any "strip + re-inject" loop is a bug magnet — when adding an injector, check it respects all upstream strip predicates (e.g. `baseBlocksBelt`).

Menswear has a `MENSWEAR OVERRIDES` block in the prompt; the deterministic validators gender-gate the rules that differ by track (work jeans, open-toe, metal-sync bag visibility).

### i18n

`src/lib/i18n/` — JSON dictionaries for `en` and `fr`, `use-labels` / `use-locale` hooks. Locale flows into AI prompts via a `LANGUAGE:` directive at the end of `dynamicSuffix` so the model writes its free-text fields (reasons, notes, summaries) in the user's language while keeping item IDs stable.

### PWA service worker

`public/sw.js` is intentionally a **pass-through** SW — install + activate + empty fetch handler. Its only job is to exist so Chrome treats the app as installable. It caches nothing. Don't add caching here without a deliberate decision; the staleness bugs caching introduces (users on old UI after a deploy, hot-reload breakage) outweigh offline support for this app.

### Launch splash

`src/components/launch-splash.tsx` renders once per session (sessionStorage `linette_splash_seen` gate; an inline script in `layout.tsx` adds `.skip-splash` to `<html>` to hide it instantly on return). The wordmark is a Lottie animation (`src/assets/linette-lottie.json`) played via `lottie-react`. **Note**: `lottie-react`'s `<Lottie>` has no `speed` prop — set speed imperatively via `lottieRef.current.setSpeed()` in an `onDOMLoaded` callback.

### Auth + admin

- `src/lib/supabase/require-user.ts` — the single auth gate. Use everywhere a route needs a logged-in user.
- `src/lib/supabase/server.ts` / `client.ts` — SSR vs. browser clients.
- `src/lib/admin-bypass.ts` — caps + paywalls skip for admin users; check `isAdmin(userId)` before applying gates if you add new ones.

## Deploy

Vercel auto-deploys on push to `main`. Production domain: `linette.app`. There are two collaborators on the repo, so **`git pull --rebase` before pushing** — this is a standing rule. Vercel's build runs `next build` which includes TS type-checking; a passing local `npx tsc --noEmit` is necessary but not sufficient.

## Conventions worth knowing

- **Prompt strings live with their route**, not in a shared prompts dir, except `analyze-prompt.ts` (reused between the legacy multipart and the URL-fetch paths).
- **Daily caps are tier-bands**, not free-floating numbers. The framework is Conservative / Balanced / Generous — current beta runs Balanced. Pricing tier changes follow the same bands.
- **Brand**: the damask texture is scoped to "lobby + share" surfaces (auth, onboarding, launch, generated outfit-share images). Don't add it to daily-use views — it competes with item photos.
- **AI cost matters more than you'd think.** At current pricing, a max-cap Linette-tier user can cost more in AI than they pay in subscription. Don't add new AI endpoints without a daily cap and a cost estimate.
