// Drives a local production build as the e2e account and plants markers
// everywhere Sentry could pick something up: a cookie, request headers, a
// query string, a request body, the Gemini prompt, a console line, a local
// variable. analyze.mjs then searches the recorded envelopes for them.
//
// Run from the repo root (README.md has the whole sequence):
//   npx tsx scripts/sentry-envelopes/capture.mts --tag <name> --mode ok|fail
// "fail" expects a server started with a broken GOOGLE_API_KEY, so the
// packing route throws and reports the error through Sentry.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Route } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { mintSessionCookies } from "../../tests/e2e/harness-session";

loadEnv({ path: path.resolve(".env.local") });

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const outDir = arg("out", ".sentry-envelopes");
const tag = arg("tag", "run");
const mode = arg("mode", "ok");
const base = arg("base", "http://localhost:3000");
mkdirSync(outDir, { recursive: true });

const email = process.env.HARNESS_EMAIL ?? "";
if (!/e2e|harness/i.test(email)) throw new Error("Set HARNESS_EMAIL to the dedicated e2e account");

const MARKS = {
  cookie: "CKMARK7f3a91",
  query: "QMARK5d20c4",
  destination: "DESTMARK-Zanzibar-88e1",
  notes: "NOTEMARK-4c7b pack my blue scarf",
  occasions: "OCCMARK-77 dinner by the sea",
  auth: "AUTHMARK9a1b",
  header: "HDRMARK-31ff",
  forwardedFor: "203.0.113.77",
  realIp: "203.0.113.78",
  console: "CONSOLEMARK-11aa",
  localVar: "LOCALVARMARK-b62c",
  fetchBody: "FETCHBODYMARK-9d0e",
};

const cookies = await mintSessionCookies(email, base);

// The session itself is the first thing to search for. This file holds a live
// token of the test account: the output folder is gitignored.
const joined = cookies
  .filter((c) => c.name.includes("auth-token"))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  .map((c) => c.value)
  .join("");
let session: { access_token?: string; refresh_token?: string; user?: { id?: string } } = {};
try {
  session = JSON.parse(joined.startsWith("base64-") ? Buffer.from(joined.slice(7), "base64url").toString("utf8") : decodeURIComponent(joined));
} catch {
  // the analyzer still searches for the raw cookie values
}
writeFileSync(
  path.join(outDir, `needles-${tag}-${mode}.json`),
  JSON.stringify({
    email,
    userId: session.user?.id ?? null,
    accessToken: session.access_token ?? null,
    refreshToken: session.refresh_token ?? null,
    cookieNames: cookies.map((c) => c.name),
    cookieValues: cookies.map((c) => c.value),
    marks: MARKS,
  })
);

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([...cookies, { name: "sentry_check", value: MARKS.cookie, url: base }]);

type Seen = { url: string; method: string; headers: Record<string, string>; postData: string | null };
const tunnel: Seen[] = [];
const note = async (route: Route) => {
  const request = route.request();
  tunnel.push({ url: request.url(), method: request.method(), headers: await request.allHeaders(), postData: request.postData() });
};
// The tunnel: read the request, then let it reach the local server, whose
// rewrite hands it to "Sentry" (the recorder). Shows what the rewrite forwards.
await context.route(/\/monitoring(\?|$)/, async (route) => {
  await note(route);
  await route.continue();
});
// Anything the page sends to Sentry directly never leaves this machine.
await context.route(/sentry\.io\//, async (route) => {
  await note(route);
  await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

const page = await context.newPage();
const consoleErrors: string[] = [];
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

// 1. Browser: a signed-in page load, some activity, then an uncaught error.
await page.goto(`${base}/?marker_q=${MARKS.query}`, { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.evaluate(async (m) => {
  console.log(m.console);
  await fetch(`/api/preferences?marker_q=${m.query}`).catch(() => null);
  // A POST the app answers with a 4xx: does the SDK keep the body of a failed call?
  await fetch(`/api/feedback?marker_q=${m.query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "not-a-real-type", message: m.fetchBody }).slice(0, -1),
  }).catch(() => null);
}, MARKS);
await page.evaluate((m) => {
  setTimeout(() => {
    const localSecret = m.localVar;
    throw new Error(`SENTRY-CHECK local test error (browser) ${localSecret.length}`);
  }, 0);
}, MARKS);
await page.waitForTimeout(3000);
await page.goto(`${base}/wardrobe?marker_q=${MARKS.query}`, { waitUntil: "load" });
await page.waitForTimeout(7000);

// 2. Server: one signed-in AI request (packing: the cheap model), with the
// markers in its body, which the route copies into the prompt.
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const packing = await context.request.post(`${base}/api/packing?marker_q=${MARKS.query}`, {
  data: { destination: MARKS.destination, notes: MARKS.notes, occasions: MARKS.occasions, startDate: day(5), endDate: day(7), locale: "en" },
  headers: {
    "x-forwarded-for": MARKS.forwardedFor,
    "x-real-ip": MARKS.realIp,
    authorization: `Bearer ${MARKS.auth}`,
    "x-check-header": MARKS.header,
  },
  timeout: 180_000,
});
const profile = await context.request.get(`${base}/profile?marker_q=${MARKS.query}`, {
  headers: { "x-forwarded-for": MARKS.forwardedFor, "x-check-header": MARKS.header },
});

await page.waitForTimeout(10_000); // let both SDKs flush
writeFileSync(path.join(outDir, `browser-${tag}-${mode}.json`), JSON.stringify({ tunnel }));
await browser.close();

const expected = mode === "fail" ? 500 : 200;
console.log(
  JSON.stringify({ tag, mode, packingStatus: packing.status(), expectedPackingStatus: expected, profileStatus: profile.status(), tunnelRequests: tunnel.length, consoleErrors }, null, 2)
);
if (packing.status() !== expected) {
  console.error(`packing answered ${packing.status()}, expected ${expected}: this run does not cover what it should`);
  process.exitCode = 1;
}
