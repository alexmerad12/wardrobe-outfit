// Reads the envelopes a capture run recorded and says what they carry.
//   node scripts/sentry-envelopes/analyze.mjs --tag <name> [--against <older tag>] [--dir .sentry-envelopes]
// Exits 1 when something that must never leave is in an envelope. Never
// prints a secret: only the NAME of what was found and where.
// --against also lists every JSON key path and span attribute that exists in
// one run and not in the other (what a Sentry upgrade added or dropped).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const dir = arg("dir", ".sentry-envelopes");
const tag = arg("tag");
const against = arg("against");
if (!tag) throw new Error("usage: analyze.mjs --tag <name> [--against <older tag>]");

// ---------- envelope parsing (lengths are in bytes) ----------
function parseEnvelope(text) {
  const buf = Buffer.from(text, "utf8");
  let pos = 0;
  const readLine = () => {
    let end = buf.indexOf(0x0a, pos);
    if (end === -1) end = buf.length;
    const line = buf.subarray(pos, end).toString("utf8");
    pos = end + 1;
    return line;
  };
  const tryJson = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const header = tryJson(readLine());
  const items = [];
  while (pos < buf.length) {
    const line = readLine();
    if (!line.trim()) continue;
    const itemHeader = tryJson(line);
    if (!itemHeader) {
      items.push({ type: "unparsed", raw: line });
      continue;
    }
    let payload;
    if (typeof itemHeader.length === "number") {
      payload = buf.subarray(pos, pos + itemHeader.length).toString("utf8");
      pos += itemHeader.length + 1;
    } else payload = readLine();
    items.push({ type: itemHeader.type ?? "unknown", raw: payload, json: tryJson(payload) });
  }
  return { header, items };
}

function walk(value, at, visit) {
  if (Array.isArray(value)) value.forEach((v) => walk(v, `${at}[]`, visit));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k, visit);
  else visit(at, value);
}

// What must never be in an envelope, by kind of needle.
const FORBIDDEN_KINDS = new Set(["session", "cookie", "cookie-name", "identity", "account-id", "secret", "marker"]);
// A console.log line is kept as a breadcrumb by default: expected, and why
// nothing personal may be logged with console.* on a page or in a route.
const EXPECTED_MARKERS = new Set(["marker:console"]);
const FORBIDDEN_PATTERNS = {
  "an ip_address key": /"ip_address"\s*:/,
  "a client address attribute": /"(user\.ip_address|client\.address|http\.client_ip|net\.peer\.ip)"\s*:/,
  "local variables in a stack frame": /"vars"\s*:/,
  "a cookies block": /"cookies"\s*:/,
  "a cookie header": /"(http\.request\.header\.)?cookie"\s*:/i,
  "a set-cookie header": /"(http\.response\.header\.)?set-cookie"\s*:/i,
  "AI prompt or answer content": /"gen_ai\.(request\.messages|input\.messages|prompt|system_instructions|response\.text|output\.messages|completion|response\.tool_calls)[^"]*"\s*:/,
  "the packing prompt": /You are Linette, an expert personal stylist|WARDROBE:/,
  "a request body": /"http\.request\.body\.data"\s*:|"request"\s*:\s*\{[^}]*"data"\s*:/,
};

function analyze(runTag) {
  const sources = [];
  const needles = [];
  const add = (name, value, kind) => value && String(value).length >= 6 && needles.push({ name, value: String(value), kind });
  for (const mode of ["ok", "fail"]) {
    const serverFile = path.join(dir, `server-${runTag}-${mode}.jsonl`);
    if (existsSync(serverFile)) {
      for (const line of readFileSync(serverFile, "utf8").split("\n").filter(Boolean)) {
        const rec = JSON.parse(line);
        // Browser headers on a record = a browser envelope that came through
        // the app's /monitoring rewrite: what the rewrite hands to Sentry.
        const viaTunnel = "x-forwarded-host" in rec.headers || "sec-fetch-site" in rec.headers || "sec-ch-ua" in rec.headers;
        sources.push({ source: viaTunnel ? "tunnel" : "server", mode, transport: { url: rec.url, headers: rec.headers }, raw: rec.body, envelope: parseEnvelope(rec.body) });
      }
    }
    const browserFile = path.join(dir, `browser-${runTag}-${mode}.json`);
    if (existsSync(browserFile)) {
      for (const rec of JSON.parse(readFileSync(browserFile, "utf8")).tunnel) {
        sources.push({ source: "browser", mode, transport: { url: rec.url, headers: rec.headers }, raw: rec.postData ?? "", envelope: parseEnvelope(rec.postData ?? "") });
      }
    }
    const needlesFile = path.join(dir, `needles-${runTag}-${mode}.json`);
    if (existsSync(needlesFile)) {
      const n = JSON.parse(readFileSync(needlesFile, "utf8"));
      add("account email", n.email, "identity");
      add("account email (url-encoded)", encodeURIComponent(n.email), "identity");
      add("account id", n.userId, "account-id");
      add("session access token", n.accessToken, "session");
      add("session refresh token", n.refreshToken, "session");
      n.cookieValues.forEach((v, i) => {
        add(`cookie value ${n.cookieNames[i]}`, v, "cookie");
        add(`cookie value ${n.cookieNames[i]}`, v.slice(0, 48), "cookie");
      });
      n.cookieNames.forEach((name) => add(`cookie name ${name}`, name, "cookie-name"));
      add("cookie name sentry_check", "sentry_check", "cookie-name");
      for (const [k, v] of Object.entries(n.marks)) add(`marker:${k}`, v, "marker");
    }
  }
  if (!sources.length) throw new Error(`no captures for tag "${runTag}" in ${dir}`);
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (value.length < 8) continue;
      // A NEXT_PUBLIC_ value ships in the page; a bare https URL (the Upstash
      // endpoint) is an address, not a credential.
      const harmless = m[1].startsWith("NEXT_PUBLIC_") || /^https:\/\/[^@\s]+$/.test(value);
      add(`env ${m[1]}`, value, harmless ? "public" : "secret");
    }
  }

  const sets = {};
  const put = (group, key, value) => (((sets[group] ??= {})[key] ??= new Set()), sets[group][key].add(value));
  const counts = {};
  const failures = new Set();
  let frames = 0;
  let framesWithVars = 0;
  const sdk = new Set();
  const events = [];

  for (const s of sources) {
    const where = s.source;
    for (const h of Object.keys(s.transport.headers ?? {})) put("transportHeaders", where, h.toLowerCase());
    const head = s.envelope.header ?? {};
    if (head.sdk) sdk.add(`${where}: ${head.sdk.name}@${head.sdk.version}`);
    const everything = `${JSON.stringify(s.transport)}\n${s.raw}`;

    for (const n of needles) {
      if (!everything.includes(n.value)) continue;
      const hits = new Set();
      const look = (label, value) =>
        walk(value, "", (at, v) => {
          if ((typeof v === "string" && v.includes(n.value)) || at.includes(n.value)) hits.add(`${where} ${label} @ ${at.slice(0, 90)}`);
        });
      look("transport", s.transport);
      look("envelope header", head);
      for (const item of s.envelope.items) {
        if (item.json !== undefined) look(item.type, item.json);
        else if ((item.raw ?? "").includes(n.value)) hits.add(`${where} ${item.type} @ (raw)`);
      }
      if (!hits.size) hits.add(`${where} @ (raw)`);
      for (const hit of hits) {
        put("found", `${n.name} [${n.kind}]`, hit);
        if (FORBIDDEN_KINDS.has(n.kind) && !EXPECTED_MARKERS.has(n.name)) failures.add(`${n.name} in ${hit}`);
      }
    }
    for (const [name, pattern] of Object.entries(FORBIDDEN_PATTERNS)) {
      if (pattern.test(s.raw) || (name === "a cookie header" && "cookie" in (s.transport.headers ?? {}))) {
        put("patterns", name, where);
        failures.add(`${name} (${where})`);
      }
    }

    for (const item of s.envelope.items) {
      counts[`${where}:${item.type}`] = (counts[`${where}:${item.type}`] ?? 0) + 1;
      const j = item.json;
      if (!j || typeof j !== "object") continue;
      walk(j, "", (at) => put("keyPaths", `${where}:${item.type}`, at));
      if (j.sdk?.settings) sdk.add(`${where} settings: ${JSON.stringify(j.sdk.settings)}`);
      if (j.user) failures.add(`a user block with ${Object.keys(j.user).join(", ")} (${where} ${item.type})`);
      for (const [name, value] of Object.entries(j.request?.headers ?? {})) {
        put("headersInEvents", `${where}:${item.type}`, value === "[Filtered]" ? `${name} = [Filtered]` : `${name} = (sent)`);
      }
      for (const crumb of j.breadcrumbs ?? []) put("breadcrumbs", `${where}:${crumb.category ?? crumb.type}`, Object.keys(crumb.data ?? {}).sort().join(",") || "(no data)");
      for (const exception of j.exception?.values ?? []) {
        for (const frame of exception.stacktrace?.frames ?? []) {
          frames++;
          if (frame.vars) framesWithVars++;
        }
      }
      if (item.type === "event") {
        events.push(`${where}/${s.mode}: ${(j.exception?.values ?? []).map((e) => `${e.type}: ${String(e.value).slice(0, 90)}`).join("; ") || j.message} | request: ${Object.keys(j.request ?? {}).join(",")}`);
      }
      for (const span of j.items ?? []) {
        const op = span.attributes?.["sentry.op"]?.value ?? "(no op)";
        for (const [key, attr] of Object.entries(span.attributes ?? {})) {
          put("spanAttributes", `${where}:${op}`, key);
          const value = JSON.stringify(attr?.value ?? "");
          if (/^http\.(request|response)\.header\./.test(key) && !value.includes("[Filtered]")) put("headersSentOnSpans", where, key);
          if (key === "url.query" || ((key === "url.full" || key === "http.target") && value.includes("?"))) put("queryStrings", where, `${key} on ${op}`);
        }
      }
    }
  }
  if (framesWithVars) failures.add(`${framesWithVars} stack frames carry local variables`);
  for (const line of sdk) if (/infer_ip/.test(line) && !/"infer_ip":"never"/.test(line)) failures.add(`the browser asks Sentry to infer the IP address (${line})`);

  const plain = (group) => Object.fromEntries(Object.entries(sets[group] ?? {}).map(([k, v]) => [k, [...v].sort()]));
  return {
    tag: runTag,
    envelopes: sources.length,
    needlesSearched: new Set(needles.map((n) => n.name)).size,
    items: counts,
    sdk: [...sdk].sort(),
    events,
    frames: `${framesWithVars} of ${frames} stack frames carry local variables`,
    found: plain("found"),
    patterns: plain("patterns"),
    headersInEvents: plain("headersInEvents"),
    headersSentOnSpans: plain("headersSentOnSpans"),
    queryStrings: plain("queryStrings"),
    transportHeaders: plain("transportHeaders"),
    breadcrumbs: plain("breadcrumbs"),
    spanAttributes: plain("spanAttributes"),
    keyPaths: plain("keyPaths"),
    failures: [...failures].sort(),
  };
}

const report = analyze(tag);
writeFileSync(path.join(dir, `report-${tag}.json`), JSON.stringify(report, null, 2));
const { keyPaths, spanAttributes, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));

if (against) {
  const old = analyze(against);
  const diff = (title, a, b) => {
    console.log(`\n=== ${title}: + only in ${tag}, - only in ${against}`);
    let any = false;
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const added = (b[key] ?? []).filter((x) => !(a[key] ?? []).includes(x));
      const removed = (a[key] ?? []).filter((x) => !(b[key] ?? []).includes(x));
      if (!added.length && !removed.length) continue;
      any = true;
      console.log(`  ${key}`);
      added.forEach((x) => console.log(`     + ${x}`));
      removed.forEach((x) => console.log(`     - ${x}`));
    }
    if (!any) console.log("  (identical)");
  };
  diff("found, by location", old.found, report.found);
  diff("headers on the request that carries the envelope", old.transportHeaders, report.transportHeaders);
  diff("request headers sent on spans", old.headersSentOnSpans, report.headersSentOnSpans);
  diff("breadcrumbs", old.breadcrumbs, report.breadcrumbs);
  diff("span attributes by operation", old.spanAttributes, spanAttributes);
  diff("every JSON key path", old.keyPaths, keyPaths);
}

if (report.failures.length) {
  console.error(`\nFAIL: ${report.failures.length} thing(s) that must never leave are in the envelopes (listed under "failures").`);
  process.exit(1);
}
console.log(`\nPASS: ${report.envelopes} envelopes, ${report.needlesSearched} needles searched, nothing forbidden found.`);
