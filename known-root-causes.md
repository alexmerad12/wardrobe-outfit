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

### Bulk upload: three photos come back together after ~81 s (2026-10-16 night)
- **Symptom:** a 5-photo bulk upload over a fast phone link (Playwright, Pixel 10 profile on 4G, against linette.app) took 139 s, and the first three tiles all finished at the same moment, ~81 s after the first photo reached `/api/items/normalize`. Logs: `modelMs` 34.9 / 52.3 / 71.1 s, the first photo's `matteMs` 22,272 and `encodeMs` 23,383 (normally ~1,300 and ~400).
- **Cause:** Fluid compute's in-function concurrency sent the three concurrent requests to one instance (Vercel's docs warn it adds latency to CPU-heavy work). Only the model run took turns, so each photo's matte and JPEG encode ran beside the next photo's model run on the instance's one vCPU, and crawled. The low-end phone runs never showed it: on a slow link the photos arrived ~20 s apart. Both levers on Vercel's side are project-wide, not per function: in-function concurrency is one switch, and with Fluid the memory/CPU size is set in the dashboard, not in `vercel.json`.
- **Fix:** `cutoutToCatalogJpeg` runs one whole photo at a time per instance, decode to JPEG (`oneAtATime`, `src/lib/cutout/one-at-a-time.ts`), and logs `waitMs` apart from `modelMs`, plus one `[cutout] session ready` line per instance (cold-start cost, threads, CPUs). Output byte-identical to production on the 5 test photos. Same test after the deploy: 98 s and 118 s (Vercel used 2 instances, then 1 for the first three photos), the first photo back at ~35 s cold, then one every ~22 s.
- **Measured on the way:** a standard (1 vCPU) instance reports 2 CPUs; cold start = ~6.8 s model download + ~5.4 s session creation; warm model run ~20-21.5 s. On a desktop CPU the model takes 21.8 s on 1 thread, 12.0 s on 2, 7.3 s on 4, so production's speed matches one thread and the Performance size (2 vCPU / 4 GB, a project-wide setting) should bring a photo to ~12-13 s.

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

### "Couldn't put together a look" on a men's Confident + Outdoor request in the rain (2026-10-16, production)
- **Symptom:** suggest answers 200 with 0 outfits and `ai_error`; the app shows "The stylist hit a hiccup". `ai_calls.metadata.rules`: `ship_path: none`, drop "confident mood + no structured/tailored piece" on the first answer and on the regenerate.
- **Cause:** two rule bugs, not the model (both answers were sensible outfits). (1) Confident fired whenever the whole wardrobe owned anything "structured", drawstring and chino trousers included, and on Outdoor too, so a sweatshirt + sweatpants + puffer + sneakers look was dropped twice. (2) The fallback gate's pattern-echo rule counted a logo sweatpant (`[solid, graphic]`) plus a sneaker's logo graphic as a repeated statement print, so even the emergency path shipped nothing. A striped tee + a sneaker side stripe failed the same way.
- **Fix:** the mood checks read `moodPool` (the pool the model saw, filtered by `wearableHere`); Confident counts genuinely tailored pieces only and never fires Outdoors (the prompt says Confident outdoors is a clean, fitted technical layer). `patternEchoOffender` is one predicate for the validator, the fallback gate and the response edge: shoe logos and stripes don't count, striped/plaid pass as a top + bottom pair. Reproduced on a copy of the wardrobe in the e2e account: 0 outfits before, 8/8 after.

### Suggest took ~28 s: one wrong shoe cost a second Gemini call (2026-10-16)
- **Symptom:** median 28.4 s on the same wardrobe; 6 of 8 requests made two Gemini calls.
- **Cause:** one rule-breaking shoe (canvas in the rain, a loafer outdoors) hard-dropped the whole outfit, and the regenerate call cost another 10-20 s. A zip hoodie tagged outerwear with no top under it did the same ("incomplete base").
- **Fix:** in `buildOutfit`, SHOE REPAIR swaps the shoe for one that passes `shoeFitsContext`, `rainRefuses` and the open-toe rule; COAT REPAIR swaps a coat the rain refuses; BASE COMPLETER adds the one missing top or bottom. When a repair swaps a piece, `textMentionsSwappedOut` (`src/lib/suggest-text-guards.ts`) sends an AI sentence that still names the old piece ("the leather boots" over sneakers) to the template; the category-level `textIsConsistent` can't see that.

### 0 outfits on a rainy day when the dry pair was in a recent outfit (2026-10-16, benchmark)
- **Symptom:** `ship_path: none`, "rain-triggered: <canvas shoe> uses non-rain-proof material" on both answers.
- **Cause:** the shoe rotation (last 2 outfits) and the anchor freshness ban (10 outfits) hide pieces from the model, but `rainHasAlternative` counts `promptItems`, which still holds them. The canvas pair was refused because of a leather pair nobody could pick.
- **Fix:** the shoe and coat repairs and the outerwear injector fall back to `promptItems` (a repeated piece beats an empty result); a hidden pair tagged for the occasion beats a visible untagged one.

### Suggest latency was thinking time: Gemini 3 Flash ignores thinkingBudget (2026-10-16)
- **Symptom:** 12-15 s per suggest call on gemini-3.6-flash, ~2,700 thinking tokens a call at `thinkingBudget` 1024 and at 3072 alike. gemini-3.8-flash thought 0 tokens at any budget.
- **Cause:** Gemini 3 Flash is steered by `thinkingLevel`. `thinkingBudget` is accepted but not honoured as a cap (3.8 rejects level MINIMAL with a 400).
- **Fix:** suggest sends a thinking level, `GEMINI_SUGGEST_THINKING_LEVEL`, default LOW (`src/lib/gemini.ts`). Benchmark on the same wardrobe (Montreal rain, Outdoor / Work / Date, 9 requests per config): 3.6 LOW 6-9 s median with ~700-1,300 thinking tokens; 3.6 MEDIUM 16-27 s; 3.8 LOW 4-5 s with zero thinking; 3.8 MEDIUM 15-81 s. Rules harness 8/8 on 3.6 LOW. With every fix in: medians 3.6 s Outdoor, 8.4 s Work, 10.2 s Date, 9/9 shipped, no regenerate.

### Every men's date look shipped "relaxed" ("I stretched a rule or two") (2026-10-16)
- **Cause:** two soft rules read the whole wardrobe. R8 (date wants silk / satin / lace / velvet) fired on the men's track because of one cotton-silk summer shirt; the men's date template asks for no such fabric. The user-tag rule counted a summer pair of date-tagged shorts, hard-banned on dates, as the "in-tag alternative".
- **Fix:** R8 is Track A only and counts `moodPool`; the tag rule counts only `moodPool` pieces that pass both tags, the weather and `casualWearBan`. Shorts / sweatpants / leggings / hoodies at dressy occasions are now hidden from the prompt whenever the slot has an allowed piece (`casualWearBan`, one predicate for the pre-filter, the validator and the fallback gate), which also removes their regenerate call (a 9°C date got summer shorts).

### Outfits styled with no weather after an Open-Meteo blip (2026-10-16)
- **Symptom:** `weather_source: none` on 4 requests in a row in a local run; a canvas pair shipped for a rainy work day because no rain rule ran. Open-Meteo answered 200 a minute later.
- **Cause:** `getWeather` made one attempt and suggest swallowed the error silently.
- **Fix:** one retry (5 s, then 4 s) in `src/lib/weather.ts`; a double failure logs `[weather] Open-Meteo failed twice`.

### Cold Outdoor looks shipped "relaxed" with warm trousers in the closet (2026-10-16, production check)
- **Symptom:** about one cold Outdoor look in four came back relaxed ("I stretched a rule or two"); the telemetry only says `softMismatch=1`.
- **Cause:** the pre-filter leaves bottoms ungated between 5 and 10°C, but the validator soft-drops a base under warmth 2 there, so the model was shown warmth-1.5 drawstring trousers at 9°C and the rule then flagged them.
- **Fix:** `baseTooLight`, one predicate for the soft drop and the pre-filter: a non-skirt bottom under the floor is hidden from the prompt when the wardrobe holds a warm-enough one; the BASE COMPLETER prefers warm-enough bottoms too.

### A rainy date got workout sneakers (2026-10-16, local check)
- **Cause:** the shoe rotation hid the date-tagged Vans (one outfit back), the other date-tagged pair was canvas (refused in the rain), so the model picked the outdoor-tagged running shoes. No rule broke, so the repair didn't run.
- **Fix:** SHOE REPAIR also swaps an off-tag pick when the rotation hid the only wearable shoes tagged for the occasion (and only then: a visible tagged pair leaves the model's choice alone).

### French stylist text in "vous" or without accents (2026-10-16, production sweep)
- **Symptom:** a French refine answer saved on an outfit read "L'association de votre cardigan...": Linette speaks French in "tu" everywhere else. A French suggest sentence came back accentless ("cree un contraste ... pour l'exterieur").
- **Cause:** refine's prompt only said "tu" in French, without suggest's explicit "never vous / votre / vos" rule, and no guard checked the voice or the accents (the corruption check only catches characters garbled inside a word).
- **Fix:** refine carries the same explicit rule; `textGuardReason` (shared by suggest and refine) rejects French with `hasVousForm` or `hasStrippedAccents`. Suggest then uses its template, refine re-asks once with the slipped sentence quoted and keeps whichever answer passes; refine logs the reason and the rejected sentence (`text_guard_reason`, `rejected_reasoning`). After the fix: French refine 16/16 clean, French suggest 6/6 in "tu" with accents.
- **Trap found on the way:** "rendez-vous" (a date) contains "vous". The first version of the check rejected every date sentence; `hasVousForm` blanks "rendez-vous" first.

### Dependency majors: what each one would have broken (2026-10-16, all adopted but TypeScript 7)
- **@sentry/nextjs 11:** `sendDefaultPii` became `dataCollection`, and unset it collects cookies (here: the Supabase session token), user info and IP, request bodies, GenAI prompts and stack-frame variables. Adopted with an explicit `SENTRY_DATA_COLLECTION` baseline in every init.
- **lottie-react 3:** rewritten API (no default export, `src` instead of `animationData`, `speed` prop). The splash was ported; screenshots confirmed the handwriting animation and the hand-off.
- **react-day-picker 10:** no code change needed; the open calendar looked see-through in a first screenshot only because it was taken during the popover's fade-in (opaque white panel, opacity 1, once settled).
- **Stripe 23:** pins API `2026-09-30.endive`, drops `payment_method_types` on Checkout (unused here); the fields the billing code reads are unchanged.
- **TypeScript 7:** tested in a clean clone. The codebase type-checks clean on TypeScript 7.0.2's native `tsc`, and Next 16 builds with it (its build calls the `tsc` CLI), but `npm run lint` dies at load: "Error: typescript-eslint does not support TS 7.0." (typescript-eslint latest 8.71.2 and canary both declare `typescript <6.1.0`). So the project's TypeScript stays 6.0.3 and CI also runs `npm run typecheck:ts7` on every push; the switch is a version bump once typescript-eslint supports 7.

### Layering bugs in the new injectors (2026-10-16 benchmark)
- **Cause:** the BASE COMPLETER re-added the subcategory the dedupe had just removed (a zip hoodie under a zip hoodie), and the outerwear injector cancelled its injection when its closest-warmth coat duplicated a subcategory, so a 9°C rain outfit shipped coatless.
- **Fix:** both skip duplicate subcategories before picking.

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
- Git Bash rewrites a leading-slash argument into a Windows path: `vercel crons run /api/cron/keepalive` became "C:/Program Files/Git/api/cron/keepalive not found". Prefix `MSYS_NO_PATHCONV=1`.
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
- **"Production's cutouts match Photoroom only ~91%"** (2026-10-16 evening): no, that number compares the two FRAMED outputs (ours 8% margin, Photoroom's catalog variant 7%), so every pixel shifts. Normalizing by each mask's bounding box is worse (one faint hanger tip moves the box: 73% on a cardigan that matches at 98%). The fair test is the mask in original photo coordinates: the deployed code path vs Photoroom's own alpha on the same 12 photos gives 98.0% mean IoU (min 95.1%, a studded belt), soft IoU 98.0%; ours keeps ~1% more edge pixels. The same run showed production's output byte-identical to the local pipeline (12/12), and a Pixel 7-emulated batch on linette.app (CPU 6x slower, weak network, 12 MP photos) saved 5/5 cutouts at a 20 MB peak JS heap.
- **"The 'hiccup' outfit failure was the wrong Gemini model"** (2026-10-16): no. Both answers were sensible outfits that the rules then dropped; the fixes were in the code (Confident + pattern echo, above).
- **"A lower thinkingBudget makes gemini-3.6-flash faster"** (2026-10-16): no. Budget 1024 and 3072 both thought ~2,700 tokens a call on the real suggest prompt. Use `thinkingLevel`.
- **"The newest Flash (gemini-3.8-flash) is the better outfit model"** (2026-10-16): not for this app. At LOW it does not reason at all (0 thinking tokens), at MEDIUM it was 2-4x slower than 3.6 and erratic (one call 81 s, 11,456 thinking tokens), and it picked the same outfits. Same price as 3.6.
- **"Syncthing reverted CLAUDE.md and the memory index"** (2026-10-16): no. A post-compaction reminder showed old copies, but disk and git held the new text, and there were no conflict files. The memory tool's "file reverted" warnings were frontmatter rewrites, not reverts.
- **"A slow bulk upload on a fast phone is the network"** (2026-10-16 night): no. On the Pixel 10 profile (4G) each 12 MP photo uploads in ~3-8 s, and the batch's time was the server: photos queued on one Fluid instance for the model (~21 s each on one vCPU, see the bulk-upload entry above). The low-end profile is the opposite: its 750 kbit/s uplink is the bottleneck.
- **"Fluid compute gives each concurrent request its own instance"** (2026-10-16 night): not reliably. In three runs of the same 5-photo batch the first three photos landed on one instance, on two, and on one. Code must assume they share one.
- **"`.npmrc`'s onnxruntime key is what stops the CUDA download"** (2026-10-16 night): not anymore, on its own. npm 11 warns the key stops working in its next major, and current npm (11.19 here, and Vercel's build) already blocks dependency install scripts unless `allowScripts` approves them. `package.json` now denies all five (esbuild, onnxruntime-node, protobufjs, unrs-resolver, @google/genai: none is needed, builds and tests pass without them), and `vercel.json`'s `installCommand` plus CI set `ONNXRUNTIME_NODE_INSTALL=skip` for npm versions that still run scripts.
