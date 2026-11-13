// Runs the whole envelope check against THIS folder's production build:
//   $env:HARNESS_EMAIL = "<the e2e account>"; npm run build
//   node scripts/sentry-envelopes/run.mjs --tag <name> [--against <older tag>] [--port 3111]
//
// It owns everything it touches, on purpose. On 2026-11-13 a hand-rolled
// version waited for "port 3000 answers", got another checkout's server, sent
// two test errors through that server's real Sentry tunnel, and then stopped
// that server by command line. So this one:
//   - uses its own ports (3111 and the next one) and refuses to start when
//     either is already taken;
//   - waits for ITS OWN server's "Ready" line, not for a port to answer;
//   - stops only the process ids it started;
//   - fails when the recorder got nothing from the server (the redirect did
//     not take, so envelopes may have gone to the real Sentry).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const tag = arg("tag");
const against = arg("against");
const dir = arg("dir", ".sentry-envelopes");
const port = Number(arg("port", "3111"));
const recorderPort = port + 1;
const modes = arg("modes", "ok,fail").split(",");
const email = process.env.HARNESS_EMAIL ?? "";

if (!tag) throw new Error("usage: run.mjs --tag <name> [--against <older tag>] [--port 3111]");
if (!/e2e|harness/i.test(email)) throw new Error("Set HARNESS_EMAIL to the dedicated e2e account");
if (!existsSync(".next/BUILD_ID")) throw new Error("No production build here: run `npm run build` first");

const listening = (p) =>
  new Promise((resolve) => {
    const socket = net.connect({ port: p, host: "localhost" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.setTimeout(1500, () => (socket.destroy(), resolve(false)));
  });
const stop = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode) return resolve();
    child.once("exit", () => resolve());
    // Windows: take the whole tree, by the id this script was given.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  });
const exitOf = (child) => new Promise((resolve) => child.once("exit", (code) => resolve(code ?? 1)));

for (const p of [port, recorderPort]) {
  if (await listening(p)) throw new Error(`Port ${p} is already in use by something this script did not start. Pass another --port.`);
}

let failed = false;
for (const mode of modes) {
  console.log(`\n===== ${tag} / ${mode}`);
  const serverFile = path.join(dir, `server-${tag}-${mode}.jsonl`);
  const recorder = spawn(process.execPath, ["scripts/sentry-envelopes/recorder.mjs", String(recorderPort), serverFile], { stdio: "inherit" });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // A relative path: an absolute one breaks when the folder's name has a
      // space (NODE_OPTIONS is split on spaces).
      NODE_OPTIONS: "--require ./scripts/sentry-envelopes/redirect.cjs",
      SENTRY_CAPTURE_PORT: String(recorderPort),
      CAP_BYPASS_EMAILS: email,
      ...(mode === "fail" ? { GOOGLE_API_KEY: "invalid-key-for-sentry-check" } : {}),
    },
  });
  try {
    await new Promise((resolve, reject) => {
      let out = "";
      const timer = setTimeout(() => reject(new Error(`the server printed no Ready line in 90 s:\n${out}`)), 90_000);
      const onData = (chunk) => {
        out += chunk;
        if (/Ready in|✓ Ready/.test(out)) {
          clearTimeout(timer);
          resolve();
        }
      };
      server.stdout.on("data", onData);
      server.stderr.on("data", (chunk) => (out += chunk));
      server.once("exit", (code) => (clearTimeout(timer), reject(new Error(`the server exited (${code}) before it was ready:\n${out}`))));
    });
    const capture = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/sentry-envelopes/capture.mts", "--tag", tag, "--mode", mode, "--out", dir, "--base", `http://localhost:${port}`],
      { stdio: "inherit" }
    );
    if ((await exitOf(capture)) !== 0) failed = true;
  } finally {
    await stop(server);
    await stop(recorder);
  }
  if (await listening(port)) throw new Error(`Port ${port} still answers after this script stopped its server.`);

  const records = readFileSync(serverFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const fromBrowser = records.filter((r) => "sec-ch-ua" in r.headers || "x-forwarded-host" in r.headers).length;
  console.log(`recorded: ${records.length - fromBrowser} envelopes from the server SDK, ${fromBrowser} from the browser through the tunnel`);
  if (records.length - fromBrowser === 0 || fromBrowser === 0) {
    console.error("The recorder is missing one side: the redirect did not take, and envelopes may have gone to the real Sentry project.");
    failed = true;
  }
}

const analysis = spawnSync(process.execPath, ["scripts/sentry-envelopes/analyze.mjs", "--tag", tag, "--dir", dir, ...(against ? ["--against", against] : [])], { stdio: "inherit" });
process.exit(failed || analysis.status !== 0 ? 1 : 0);
