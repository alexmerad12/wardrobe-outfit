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
- **Fix:** owner reactivates billing. For local tests, `GEMINI_QUALITY_MODEL` swaps the quality model (e.g. gemini-2.5-flash).
- **Also confirmed (2026-10-16):** the old `gemini-3.5-flash` name, still used by production before this deploy, is counted against the gemini-3.6-flash quota. A request to it is refused naming gemini-3.6-flash. The alias is no separate bucket, and live linette.app shares the cap.

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
- **"gemini-3.8-flash can stand in for 3.6 while 3.6 is capped"** (2026-10-16): no. gemini-3.6-flash and gemini-3.8-flash each served one request after the reset, then hit the free-tier cap (gemini-3.7-flash untested). The Flash-Lite models kept answering.
- **"The daily reset will free the free tier for testing"** (2026-10-16): no. After the 00:00 UTC reset, gemini-3.6-flash served one request, then refused every call again (36 refine refusals by 00:45).
- **"Syncthing reverted CLAUDE.md and the memory index"** (2026-10-16): no. A post-compaction reminder showed old copies, but disk and git held the new text, and there were no conflict files. The memory tool's "file reverted" warnings were frontmatter rewrites, not reverts.
