# What does Sentry actually receive?

Run this after every `@sentry/*` upgrade and after any change to a `Sentry.init`.
It records the envelopes this folder's production build sends and searches them, so
the privacy baseline (`src/lib/sentry-data-collection.ts`) is measured, not assumed.
Nothing reaches the real Sentry project: the server process's traffic to
`*.sentry.io` is redirected to a local recorder (`redirect.cjs`).

## Run it

```powershell
$env:HARNESS_EMAIL = "<the dedicated e2e account>"
npm run build
node scripts/sentry-envelopes/run.mjs --tag new
```

`run.mjs` starts the recorder and `next start` on its own ports (3111 and 3112),
drives them (`capture.mts`), stops the two processes it started, and runs
`analyze.mjs`. It exits 1 when a session token, a cookie, the email, the account
id, a secret, a planted marker, an IP key, stack-frame variables, a request body or
prompt text is in any envelope, or when the recorder saw nothing from the server.

Never run the pieces by hand against "whatever answers on port 3000", and never
stop a server by its command line here: another checkout's server looks the same
(2026-11-13, `known-root-causes.md`).

## Before and after an upgrade

On the old lockfile: `npm ci`, `npm run build`, `run.mjs --tag old`. On the new one:
`npm ci`, `npm run build`, `run.mjs --tag new --against old`. The second run lists
every JSON key path and span attribute that exists in one run and not the other,
which is how a field nobody thought to search for shows up.

## What it covers

- A signed-in browser session with an uncaught error. The envelopes go through the
  `/monitoring` tunnel and the app's rewrite, as in production, so the headers the
  rewrite forwards are recorded too.
- A signed-in server request that succeeds with a real Gemini call (`ok`: packing,
  the cheap model, under one cent) and one that throws and is reported through
  `Sentry.captureException` (`fail`: a broken `GOOGLE_API_KEY`).
- Planted markers: a cookie, `authorization` / `x-forwarded-for` / `x-real-ip`
  headers, a query string, a request body that the route copies into the Gemini
  prompt, a console line, a local variable. Plus the account's email, id and
  session tokens, and every value in `.env.local`.

Not covered: the `onRequestError` hook (no route throws uncaught), the edge init
(nothing runs on the edge runtime), try-on and photo tagging (same SDK path as
packing, other payloads), and how Vercel itself handles the rewrite.

## What a clean run still contains (2026-11-13, 11.12.0)

- The DSN and the Supabase project URL (both public), the Upstash endpoint URL.
- Header NAMES of the incoming request, with `[Filtered]` as the value for all but
  `user-agent`, `content-type` and `accept-language`.
- The text of `console.*` calls made before an error, as breadcrumbs. Never log
  anything personal with `console.*`.
- Paths, without their query strings.

The output folder `.sentry-envelopes/` holds a live session token of the test
account while it exists. It is gitignored: delete it when done.
