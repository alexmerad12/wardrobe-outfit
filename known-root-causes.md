# Known root causes — Linette

Check this before debugging. Log every confirmed root cause AND every debunked
hypothesis here after, so nobody re-chases a theory that was already ruled out.
Public repo: technical facts only, no keys, accounts or client details.

## Confirmed

### Whole app down: Supabase project paused (found 2026-10-09, fixed 2026-10-15)
- **Symptom:** the site shell loads, login and every data call fail.
- **Cause:** the Supabase project is on the free plan, which pauses after 7 days without activity.
- **Fix:** restored on the free plan; `vercel.json` runs a daily cron on `/api/cron/keepalive` (one-row read, `CRON_SECRET`), live once deployed.

### Every background removal killed on Vercel (2026-10-15)
- **Symptom:** `/api/items/normalize` returns 500 after ~22 s; logs say "instance was killed because it ran out of available memory".
- **Cause:** the stock BiRefNet-lite ONNX export peaks near 6 GB per 1024 px run. Exporters turn its deformable convolutions into gathers over channels x 49 taps x pixels. A Vercel function has 2 GB.
- **Fix:** our own export, `scripts/cutout/export_birefnet_lite_lean.py`: tap-by-tap GridSample deformable conv plus two concats folded into sums. Same masks as PyTorch (100% IoU), ~1.3 GB peak. Measure peak with `process.resourceUsage().maxRSS`: a 10 ms RSS sampler missed the spike.

### AI endpoints fail with Gemini 429 "FreeTier" (2026-10-15)
- **Symptom:** suggest / refine / try-on 500; logs show `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20.
- **Cause:** billing on the AI Studio project behind `GOOGLE_API_KEY` is inactive. Every model is capped at 20 requests a day per project, shared with production.
- **Fix (2026-10-16):** the Google Cloud billing account behind the key was CLOSED (its primary card declined), which AI Studio shows as "Account inactive · Free tier" even with prepaid credit left on it. Another card already on file was made primary and the account reopened (Cloud console > Billing > Account management > Reopen billing account): Tier 1 within a minute, gemini-3.6-flash answered at once. For local tests, `GEMINI_QUALITY_MODEL` swaps the quality model (e.g. gemini-2.5-flash).
- **Also confirmed (2026-10-16):** the old `gemini-3.5-flash` name, still used by production before this deploy, is counted against the gemini-3.6-flash quota. A request to it is refused naming gemini-3.6-flash. The alias is no separate bucket, and live linette.app shares the cap.

### Outfit requests fail while gemini-3.6-flash is overloaded (2026-10-16)
- **Symptom:** suggest returns 500 after ~5 s. Server logs show four attempts, each `503 UNAVAILABLE "This model is currently experiencing high demand"`. The rules harness lost its first test this way for 2.5 minutes straight, so the other 7 never ran.
- **Cause:** the quality tier called one model only. Retries can't outlast a 503 spell that runs for minutes, and free-tier traffic is served last.
- **Fix:** `withModelFallback(QUALITY_MODELS, ...)` in suggest, refine and try-on (`src/lib/gemini-retry.ts`). After one retry on a 503 (at once on a day-cap 429) the call moves to `gemini-3.5-flash-lite`, which has its own capacity and quota. Verified live the same day: 3.6 kept answering 503, and the outfit came from Flash-Lite (200). Flash-Lite itself answered 503 twice before it worked, so it gets the full 3 retries.

### No outfit at all on rainy days when the only shoes are suede or canvas (2026-10-16)
- **Symptom:** suggest answers 200 with 0 outfits. `ai_calls.metadata.rules` shows `ship_path: none` and the drop `rain-triggered: "<shoe>" (shoes) uses non-rain-proof material` on the first answer and on the regenerate. Found by the endpoint sweep on a Vercel preview, where the weather comes from the request's IP (Montreal, 100% rain).
- **Cause:** the rain rule was not wardrobe-aware. The shoe injector fell back to the only (suede) pair, then the validator and the fallback gate both refused it. Shoes are a required slot, so nothing could ship. The outdoor/travel open-toe rule, coats and bags had the same gap.
- **Fix:** `rainRefuses` in `suggest/route.ts`, one predicate for the injectors, the validator and the fallback gate. A rain-unworthy shoe, coat or bag is refused only when the candidate pool holds a rain-worthy alternative for that slot that passes the slot's own rules. The prompt says the same. Reproduced and verified with Montreal's coordinates in the `x-vercel-ip-*` headers: only suede shoes gave 0 outfits before and 1 after; suede plus leather gives the leather pair, before and after. A Vercel preview of the fix (88ac46b) answered suggest with an outfit in the same rain.

### Packing 502 "Failed to generate packing list": an answer that stops being JSON partway (2026-10-16)
- **Symptom:** after billing was back on, the production sweep's packing call answered 502 in 4.5 s; `ai_calls` logged it as answered by gemini-3.5-flash-lite (not a Google refusal), and the log showed an answer that began as valid JSON.
- **Cause:** the route parsed the model's answer once and gave up. 1 of ~6 production packing answers that day couldn't be parsed, while 40 direct replays of the same prompt shape all parsed (~600 tokens, finish STOP), so it is intermittent. Analyze, try-on's photo read and refine had the same single-shot parse; in analyze and try-on a half-valid answer even reached an unguarded `JSON.parse` and became a 500 ("Couldn't read the photo" for a photo that was fine). Only suggest retried a bad shape.
- **Fix:** `withParseRetry(call, parse)` in `src/lib/gemini-retry.ts`, used by packing, analyze, try-on and refine: an unparseable answer is asked again once, and the final failure logs the answer's tail (packing also logs finishReason).

### Photo tagging 504 on Vercel while Google is slow (2026-10-16)
- **Symptom:** `/api/items/analyze` answers 504 at exactly 60 s on a Vercel preview, 3 of 6 photos. Bulk items keep blank tags.
- **Cause:** free-tier Gemini latency (the same photos took 27-31 s locally that hour, 3-8 s on earlier days) against the route's 60 s `maxDuration`. A function killed at the limit also skips the daily-cap refund.
- **Fix:** analyze, try-on and packing allow 120 s, like suggest. The same afternoon, locally, Flash-Lite answered 503 to all four tries on 3 of 6 photos (500 "Analysis failed"), so the fast tier now falls back too: `FAST_MODELS` = Flash-Lite, then the quality model.

### 500 on unknown fields in CRUD routes (2026-10-15)
- **Symptom:** POST /api/outfits or /api/trips returns 500 "Could not find the 'x' column".
- **Cause:** routes pass the body straight to Supabase, so an unknown column (here a test payload's `occasion` instead of `occasions`) surfaced as a server error. The app's own pages send the right names.
- **Fix:** `dbErrorResponse` maps database input errors to 400.

### Styling rules contradicting their own prompt (2026-10-15)
- **Cause:** the belt strip, the accessory injector and the belt completer each kept their own copy of the belt predicate. The completer demanded the belt the strip had removed. Several injectors ignored the validators' rules (bag size, backpacks, warmth, hats).
- **Fix:** one hoisted predicate per rule in `suggest/route.ts` (`beltBlockedBy`, `hatProblem`, `shoeFitsContext`, `bagOkForInjection`...).

### Mood rules demanding a piece the outfit can't wear (2026-10-16)
- **Symptom:** suggest ships "EMERGENCY ADMIT" (relaxed) outfits on Confident; the debug drops show "confident mood + no structured/tailored piece" on both the first answer and the regenerate.
- **Cause:** Confident / Energized / Bold fired when the wardrobe owned a compliant piece anywhere, even when this outfit couldn't wear it: tailored trousers with a pinned dress, a blazer at home or at 25°C+ (no outerwear).
- **Fix:** `wearableHere` in `suggest/route.ts`, so the rules only count pieces wearable in this request (occasion, weather, anchor slot). Harness emergency admits went from 4 to 2 (the 2 left: a women's fixture wardrobe on the men's track).

### 5-8 identical `/api/preferences` requests per page (2026-10-15)
- **Cause:** `useLocale` (~40 components), `useTemperatureUnit`, the weather widget and the item pages each fetched on mount.
- **Fix:** `src/lib/preferences-client.ts`, one shared request per page (60 s reuse, invalidated on save and sign-out).
- **Also (2026-10-16, found on production):** signed-out pages (login, sign-up) still made that request and logged a 401 in the console on every visit, as the old per-hook fetches had. `getPreferences` now skips it when there is no Supabase session cookie.

### Preview deploys broken or not matching git (2026-10-15)
- **Causes:** (1) the Vercel Preview environment has no Supabase, Google or KV variables; (2) a CLI deploy uploads gitignored local-only files (e.g. `src/app/logo-lab/`), so the build differs from what git deploys.
- **Fix:** deploy previews from a clean `git archive` of a commit, passing the missing variables per deployment (`--env` / `--build-env`).

### Tooling traps on this machine (2026-10-15)
- Edit tools fail on multi-line matches in CRLF files (`core.autocrlf=true`). Git Bash `sed` strips the CRs, so the file looks LF. Use single-line anchors.
- Next 16 allows one `next dev` per folder ("Another next dev server is already running"). Run a second server with `next start` on a build.
- Another project's dev server can hold port 3000. Tests then hit the wrong app (404s). Use `playwright.audit.config.ts` (port 3001).
- Python packages with deep test folders fail to install under the long scratchpad path (Windows 260-character limit). Use a short venv path.
- Home and wardrobe pages crash ("Invalid src prop ... hostname is not configured") when the account holds items whose `image_url` host is not in `next.config.ts` `images.remotePatterns`. In practice only test fixtures do (`https://example.com/...`): real items use Supabase storage (249) or Vercel Blob (10), both allowed (checked 2026-10-16). Don't run the UI smoke while another spec's fixtures sit in the test wardrobe.

## Debunked

- **"The fp16 model file halves memory"** (2026-10-15): no. The fp16 and fp32 stock exports both peaked near 6 GB. Activations dominate, not weights.
- **"The ONNX Runtime CPU arena causes the OOM"** (2026-10-15): no. Peak RSS stayed ~6 GB with the arena off.
- **"A lower graph optimization level saves memory"** (2026-10-15): no. "basic" / "extended" peaked at 3-3.7 GB on the lean model, "all" at 1.3 GB.
- **"A stricter confidence cutoff makes the cutouts match Photoroom"** (2026-10-16): not worth it. Our masks run slightly larger than Photoroom's (we keep 1.7% extra pixels on average, Photoroom keeps 0.4% we cut). Scoring alpha = sigmoid(k·(logit − b)) over 32 settings against Photoroom's masks on 12 photos (`scratchpad` calib, same resize and speck cleanup as the app): best mean IoU 98.11% vs 97.98% today. Hard edges improve (belt 95.1% → 96.0%), fuzzy ones regress (faux fur 98.8% → 98.1%), and the one visible flaw, a white tee's cast shadow on a white door kept as part of the sleeve, barely moves (97.5% → 97.6%) because the model is confident about it. Mapping left as is; white-on-white cast shadows are a known limit of the model.
- **"Just use ISNet or BEN2"** (2026-10-15): ISNet fits (0.8 GB) but scored 84.7% mask IoU against Photoroom and lost one garment entirely. BEN2 needs 3.5 GB.
- **"The Gemini 429 is a per-minute rate limit"** (2026-10-15): no. The quota id is PerDay FreeTier.
- **"Flash-Lite is as good as Flash for outfits"** (2026-10-16): not quite. gemini-3.5-flash-lite passed every hard rule (harness 8/8, sweep 61/61) but skipped the soft "statement piece" instruction that gemini-3.6-flash followed on the same request. Hard rules hold on either model because the code enforces them; taste instructions don't.
- **"gemini-3.8-flash can stand in for 3.6 while 3.6 is capped"** (2026-10-16): no. gemini-3.6-flash and gemini-3.8-flash each served one request around 00:00 UTC on 2026-10-16, then hit the free-tier cap (gemini-3.7-flash untested). The Flash-Lite models kept answering.
- **"Gemini's free-tier counter resets at 00:00 UTC"** (2026-10-16): no. Requests-per-day quotas reset at midnight Pacific (07:00 UTC while daylight time runs, 08:00 UTC in winter), per Google's rate-limits page. The 00:00 UTC probe that found the 3.6 bucket still full (1 request served, 36 refine refusals by 00:45) was not a reset test. After the real reset, refine passed on gemini-3.6-flash on the free tier at the first attempt (13:32 UTC).
- **"Syncthing reverted CLAUDE.md and the memory index"** (2026-10-16): no. A post-compaction reminder showed old copies, but disk and git held the new text, and there were no conflict files. The memory tool's "file reverted" warnings were frontmatter rewrites, not reverts.
