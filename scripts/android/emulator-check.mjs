// Drives the Android app on an emulator and checks what only a real
// Android system can show: that it installs and starts, loads the site,
// carries the app's user agent and the native bridge, lays the page out
// clear of the system bars, handles Back, keeps cookies across a restart,
// opens Android's share sheet, follows dark mode and shows the offline
// page. Used by .github/workflows/android.yml (this PC has no Android
// SDK). No account and no secret: everything happens signed out.
//
//   node scripts/android/emulator-check.mjs <app-debug.apk> [output folder]
//
// It talks to the app two ways: adb (install, keys, screenshots) and the
// WebView's debugging socket, which a debug build opens (Chrome DevTools
// protocol over Node's own WebSocket, no dependency).
// Output folder: screenshots, report.txt, annotations.txt (GitHub
// workflow commands the workflow prints on the run page), logcat.txt.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const apk = process.argv[2];
const outDir = path.resolve(process.argv[3] ?? "android-check");
if (!apk || !fs.existsSync(apk)) {
  console.error("usage: node scripts/android/emulator-check.mjs <app-debug.apk> [output folder]");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const PKG = "app.linette";
const ACTIVITY = `${PKG}/.MainActivity`;
const SITE = "https://linette.app";
const PORT = 9222;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- adb ----------
function adb(args, options = {}) {
  return execFileSync("adb", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 180_000, ...options });
}
/** A device shell command; never throws, returns whatever was printed. */
function sh(command) {
  try {
    return adb(["shell", command]);
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}` || String(error.message);
  }
}
const focusedWindow = () => sh("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'").replace(/\s+/g, " ").trim();
// A busy emulator can raise "Pixel Launcher isn't responding" over the
// app. The dialog takes the keys meant for the app (in one run Back went
// to it and three checks failed for that reason alone). Tap "Wait" until
// none is left, and keep the names for the report.
const closedDialogs = [];
async function dismissSystemDialogs() {
  for (let i = 0; i < 6; i++) {
    const dialog = /Application (?:Not Responding|Error): ([\w.]+)/.exec(sh("dumpsys window | grep mCurrentFocus"));
    if (!dialog) return;
    closedDialogs.push(dialog[1]);
    const tree = sh("uiautomator dump /sdcard/ci-ui.xml >/dev/null 2>&1; cat /sdcard/ci-ui.xml");
    const button =
      /text="Wait"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tree) ??
      /text="Close app"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tree);
    if (button) sh(`input tap ${(Number(button[1]) + Number(button[3])) >> 1} ${(Number(button[2]) + Number(button[4])) >> 1}`);
    else sh("input keyevent KEYCODE_ESCAPE");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
const appPid = () => {
  const pid = sh(`pidof ${PKG}`).trim().split(/\s+/)[0];
  return /^\d+$/.test(pid ?? "") ? pid : null;
};
/** A screenshot, saved when it has a name. Null when the emulator can't
 *  take one (screencap crashed on the Android 17 image, 2026-11-13). */
let screenshotFailures = 0;
function capture(name) {
  // After two failures in a row, stop asking: each failed try is a native
  // crash of the tool, which fills the crash log the report quotes.
  if (screenshotFailures >= 2) return null;
  try {
    const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 256 * 1024 * 1024, timeout: 60_000 });
    if (png.length < 1000) throw new Error("empty screenshot");
    if (name) fs.writeFileSync(path.join(outDir, `${name}.png`), png);
    screenshotFailures = 0;
    return png;
  } catch {
    screenshotFailures++;
    return null;
  }
}

/** Why the app's process ended, in Android's own words, and the part of
 *  the crash log that names the app. */
function whyTheAppDied() {
  const exits = sh(`dumpsys activity exit-info ${PKG}`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /reason=|description=|subreason=|importance=/.test(line))
    .slice(0, 4)
    .join(" ; ");
  const crashLog = sh("logcat -d -b crash");
  const at = crashLog.indexOf(PKG);
  const excerpt = at === -1 ? "the crash log has no entry for the app" : crashLog.slice(Math.max(0, at - 400), at + 1400).replace(/\s*\n\s*/g, " | ");
  return `${exits || "no exit record"} || ${excerpt}`.slice(0, 2600);
}

/** The first crash of Android's own processes in the crash log, or what
 *  the main log says about the system being restarted. */
function systemCrash() {
  const crashLog = sh("logcat -d -b crash");
  const at = crashLog.search(/FATAL EXCEPTION IN SYSTEM PROCESS|>>> system_server <<<|>>> \/system\/bin\/surfaceflinger <<<|>>> com\.android\.systemui <<</);
  const crash = at === -1 ? "no crash of a system process in the crash log" : crashLog.slice(at, at + 1700).replace(/\s*\n\s*/g, " | ");
  const restarts = sh("logcat -d -b main,system | grep -m 4 -iE 'WATCHDOG KILLING SYSTEM PROCESS|Exit zygote because system server|system_server.*(died|crashed)|Boot is finished'")
    .replace(/\s*\n\s*/g, " | ")
    .trim();
  return `${crash} || main log: ${restarts || "nothing about a restart"}`.slice(0, 2600);
}

// ---------- results ----------
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  return Boolean(ok);
}
function note(name, detail) {
  results.push({ name, ok: null, detail: String(detail) });
  console.log(`note  ${name}: ${detail}`);
}

// ---------- screenshots as numbers ----------
// screencap writes an 8-bit RGB or RGBA PNG. Decoding it here lets the
// report say how bright a frame is (a white flash at launch shows up as a
// number) without anyone opening the image.
function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, channels = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unexpected PNG format");
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`unexpected PNG colour type ${data[9]}`);
    } else if (type === "IDAT") chunks.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const here = y * stride;
    const above = here - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[here + x - channels] : 0;
      const b = y ? pixels[above + x] : 0;
      const c = y && x >= channels ? pixels[above + x - channels] : 0;
      let value = raw[line + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[here + x] = value & 255;
    }
  }
  return { width, height, channels, pixels };
}
/** Mean brightness (0 black, 255 white) of a horizontal band of a frame. */
function brightness(png, from = 0, to = 1) {
  if (!png) return -1;
  const { width, height, channels, pixels } = decodePng(png);
  let sum = 0, count = 0;
  for (let y = Math.floor(height * from); y < Math.floor(height * to); y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * channels;
      sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      count++;
    }
  }
  return count ? Math.round(sum / count) : -1;
}

// ---------- the WebView's debugging socket ----------
class Devtools {
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("the debugging socket refused the connection")), { once: true });
    });
    return new Devtools(socket);
  }
  constructor(socket) {
    this.socket = socket;
    this.lastId = 0;
    this.waiting = new Map();
    socket.addEventListener("message", (message) => {
      const data = JSON.parse(message.data);
      const waiter = this.waiting.get(data.id);
      if (!waiter) return;
      this.waiting.delete(data.id);
      if (data.error) waiter.reject(new Error(data.error.message));
      else waiter.resolve(data.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.lastId;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`${method} got no answer`));
      }, 30_000);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  /** Runs JavaScript in the page and returns its (JSON) value. */
  async run(expression) {
    const answer = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (answer.exceptionDetails) {
      throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    }
    return answer.result.value;
  }
  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

async function connect(timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const pid = appPid();
    if (!pid) last = "the app is not running";
    else {
      try {
        adb(["forward", `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(5000) })).json();
        const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
        if (page) return await Devtools.open(page.webSocketDebuggerUrl);
        last = "the WebView lists no page yet";
      } catch (error) {
        last = error.message;
      }
    }
    await sleep(1500);
  }
  throw new Error(`could not reach the app's WebView (${last})`);
}

/** Polls a page expression until it is truthy. Returns the value, or null. */
async function waitFor(page, expression, timeoutMs = 30_000, everyMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await page.run(expression);
      if (value) return value;
    } catch {
      // The page is between two documents: ask again.
    }
    await sleep(everyMs);
  }
  return null;
}
async function waitUntil(test, timeoutMs = 15_000, everyMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await test()) return true;
    await sleep(everyMs);
  }
  return false;
}
const pagePath = (page) => page.run("location.pathname").catch(() => "");
const splashGone = "!document.querySelector('.launch-splash') && document.readyState === 'complete'";

// The newer images can run the person's session as a user other than the
// system's (user 0): the app is started for whoever is in front.
let foregroundUser = "0";
function launch() {
  return sh(`am start --user ${foregroundUser} -n ${ACTIVITY}`);
}
/** Who is in front, which users exist, and what Android knows about the
 *  app for each of them. */
function packageState() {
  const state = sh(`dumpsys package ${PKG}`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^User \d+:|^versionName=|^Package \[/.test(line))
    .map((line) => line.replace(/ceDataInode=\S+\s*/, "").slice(0, 150))
    .slice(0, 6)
    .join(" ; ");
  const users = sh("pm list users").split("\n").map((line) => line.trim()).filter((line) => line.startsWith("UserInfo")).join(" ");
  return `in front: user ${foregroundUser}; ${users || "no user list"}; ${state || `Android does not know ${PKG}`}; path: ${sh(`pm path ${PKG}`).trim() || "none"}`.slice(0, 900);
}

// ---------- the run ----------
let page = null;
try {
  adb(["wait-for-device"]);
  const sdk = sh("getprop ro.build.version.sdk").trim();
  const release = sh("getprop ro.build.version.release").trim();
  const size = /(\d+)x(\d+)/.exec(sh("wm size")) ?? [];
  const screen = { width: Number(size[1]), height: Number(size[2]), density: Number(/(\d+)/.exec(sh("wm density"))?.[1]) };
  const webview = /Current WebView package[^:]*:\s*\(([^,]+),\s*([^)]+)\)/.exec(sh("dumpsys webviewupdate"));
  note("device", `Android ${release} (API ${sdk}), ${screen.width}x${screen.height} at ${screen.density} dpi, WebView ${webview ? `${webview[2]} (${webview[1]})` : "unknown"}`);

  // The soft keyboard must open although the emulator has a hardware one.
  sh("settings put secure show_ime_with_hard_keyboard 1");
  // Ask Android not to show "isn't responding" dialogs at all (the helper
  // above closes any that still come).
  sh("settings put global hide_error_dialogs 1");
  sh("cmd uimode night no");

  // "Boot completed" comes before the system can install anything (on the
  // Android 17 image the first install failed inside the package
  // manager): wait for it, then give the install a few tries.
  await waitUntil(
    () => sh("getprop sys.boot_completed").trim() === "1" && /^package:/m.test(sh("pm path android")) && /package:/.test(sh("pm list packages com.android.shell")),
    120_000,
    2000,
  );
  const firstInstall = (() => {
    try {
      return adb(["install", "-r", "-g", apk]);
    } catch (error) {
      return `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
  })();
  let installed = firstInstall;
  for (let attempt = 2; attempt <= 6 && !/Success/.test(installed); attempt++) {
    console.log(`install, try ${attempt - 1}: ${installed.trim().split("\n")[0]}`);
    await sleep(10_000);
    try {
      installed = adb(["install", "-r", "-g", apk]);
    } catch (error) {
      installed = `${error.stdout ?? ""}${error.stderr ?? ""}` || String(error.message);
    }
  }
  // The reason is on the line that says Failure or Exception and the few
  // after it.
  const installLines = installed.split("\n").map((line) => line.trim()).filter(Boolean);
  const reasonAt = Math.max(0, installLines.findIndex((line) => /Success|Failure|Exception|Error/i.test(line)));
  const installDetail = installLines.slice(reasonAt, reasonAt + 5).join(" | ").slice(0, 600);
  if (!check("the app installs", /Success/.test(installed), installDetail)) throw new Error("install failed");
  const current = sh("am get-current-user").trim();
  if (/^\d+$/.test(current)) foregroundUser = current;
  note("users and the installed app", packageState());

  // A freshly booted emulator says "boot completed" before its network is
  // up: the first run opened the app straight into its offline page. Wait
  // until Android itself has validated the connection.
  const online = await waitUntil(() => /Capabilities:[^\n]*\bVALIDATED\b/.test(sh("dumpsys connectivity")), 120_000, 2000);
  note("network", online ? "validated before the first launch" : "NOT validated after 2 minutes: the launch may end on the offline page");
  // "Validated" is not enough: the emulator's lookup of a name it has
  // never resolved can still fail for some seconds (three runs opened on
  // the offline page with net::ERR_NAME_NOT_RESOLVED). Wait for the name.
  const resolves = await waitUntil(() => /^PING \S+ \([0-9a-f.:]+\)/m.test(sh("ping -c 1 -W 2 linette.app")), 90_000, 2000);
  note("name lookup", resolves ? "linette.app resolves before the first launch" : "linette.app did NOT resolve within 90 seconds");

  // Let the home screen come up and settle before the app is started.
  await waitUntil(() => /launcher/i.test(focusedWindow()), 90_000, 2000);
  await dismissSystemDialogs();

  // --- 1. Cold start: what the first seconds look like ---
  sh("logcat -c");
  sh(`am force-stop ${PKG}`);
  const started = Date.now();
  const startOutput = launch();
  const frames = [];
  for (let i = 0; i < 9; i++) {
    const png = capture(i === 1 ? "01-launch-first-second" : null);
    // A frame counts once the app's own window (launch screen included)
    // is the one in front: before that it is still the home screen.
    frames.push({ at: ((Date.now() - started) / 1000).toFixed(1), light: brightness(png), app: focusedWindow().includes(PKG) });
    await sleep(250);
  }
  note(
    "launch frames (seconds: brightness 0-255, * = the app is in front)",
    frames.map((f) => `${f.at}s:${f.light}${f.app ? "*" : ""}`).join(" "),
  );
  const running = appPid() !== null;
  check("the app starts and stays up", running && !/Error|Exception/.test(startOutput), startOutput.trim().split("\n").pop());
  if (!running) {
    note("why the app is not running", whyTheAppDied());
    note("users and the installed app, after the failed start", packageState());
    note("what Android says about starting it", sh(`am start -W --user ${foregroundUser} -n ${ACTIVITY}`).replace(/\s+/g, " ").trim().slice(0, 400));
    // A control, to tell the app from the emulator: can this Android start
    // one of its own apps and stay up? ("Can't find service" means the
    // system itself restarted.)
    const servicesUp = () => /^package:/m.test(sh("pm path android"));
    await waitUntil(servicesUp, 90_000, 3000);
    note("what crashed in Android itself", systemCrash());
    sh("am force-stop com.android.settings");
    const settings = sh("am start -W -n com.android.settings/.Settings").replace(/\s+/g, " ").trim();
    await sleep(6000);
    note(
      "control: Android's own Settings app on this emulator",
      `${/Status: ok/.test(settings) && servicesUp() ? "starts and the system stays up" : "does NOT start cleanly, so the emulator is at fault, not the app"} (${settings.slice(0, 220)}; Settings running: ${/^\d+/.test(sh("pidof com.android.settings").trim()) ? "yes" : "no"}; system services after 6 s: ${servicesUp() ? "up" : "down"})`,
    );
    throw new Error("the app's process ended during its first seconds");
  }
  // The phone is in light mode. The system launch screen, then the site's
  // own, are both black: a bright frame of the app in its first seconds
  // would be an empty white window between them.
  const early = frames.filter((f) => f.app && f.light >= 0).slice(0, 3);
  if (early.length === 0) note("launch flash", "not checked: no screenshot of the app's first seconds on this emulator");
  else check("no white flash in the first frames of a launch", early.every((f) => f.light < 90), early.map((f) => `${f.at}s:${f.light}`).join(" "));

  // --- 2. The site inside the app ---
  page = await connect();
  const onLaunchPage = `location.origin === ${JSON.stringify(SITE)} && location.pathname === "/launch" && document.readyState === "complete"`;
  let landed = await waitFor(page, onLaunchPage, 60_000);
  // What the app itself logged about the first page (MainActivity).
  const appLog = sh("logcat -d -s Linette:V")
    .split("\n")
    .filter((line) => /Linette\s*:/.test(line))
    .map((line) => line.replace(/^.*?Linette\s*:\s*/, "").trim())
    .slice(0, 8)
    .join(" / ");
  note("what the app logged during its first launch", appLog || "nothing");
  check(
    "the first launch reaches the site's launch page by itself (signed out)",
    landed,
    await page.run("location.href").catch((e) => e.message),
  );
  // If the launch ended on the offline page, carry on from there so the
  // rest still gets checked.
  for (let attempt = 0; attempt < 6 && !landed; attempt++) {
    await page.run("(document.querySelector('a[lang=en]') || document.querySelector('a')).click()").catch(() => {});
    landed = await waitFor(page, onLaunchPage, 15_000);
  }
  if (!landed) throw new Error("the site never loaded inside the app");

  const userAgent = await page.run("navigator.userAgent");
  const chrome = Number(/Chrome\/(\d+)\./.exec(userAgent)?.[1] ?? 0);
  check("the user agent carries the app's mark", /LinetteAndroid\/\d+/.test(userAgent), userAgent);

  const bridge = await page.run(
    "({ native: typeof Capacitor === 'object' && Capacitor.isNativePlatform(), platform: typeof Capacitor === 'object' ? Capacitor.getPlatform() : null, plugins: typeof Capacitor === 'object' ? Object.keys(Capacitor.Plugins || {}).sort() : [] })",
  );
  check(
    "the native bridge and its plugins reach the page",
    bridge.native && bridge.platform === "android" && ["App", "Filesystem", "Purchases", "Share", "SystemBars"].every((name) => bridge.plugins.includes(name)),
    `${bridge.platform}: ${bridge.plugins.join(", ")}`,
  );

  // The site's own part ships with the web deploy, which can land a few
  // minutes after this workflow starts: reload until it is there.
  let siteReady = false;
  for (let attempt = 0; attempt < 16 && !siteReady; attempt++) {
    siteReady = Boolean(await waitFor(page, "document.documentElement.getAttribute('data-shell') === 'android'", attempt ? 5000 : 3000));
    if (!siteReady) {
      await sleep(15_000);
      await page.send("Page.reload").catch(() => {});
      await waitFor(page, "document.readyState === 'complete'", 30_000);
    }
  }
  check("the site knows it runs inside the app (data-shell)", siteReady);

  await waitFor(page, splashGone, 30_000);
  await sleep(800);
  capture("02-launch-light");

  const layout = await page.run(`(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const root = getComputedStyle(document.documentElement);
    const out = {
      envTop: parseFloat(style.paddingTop) || 0,
      envBottom: parseFloat(style.paddingBottom) || 0,
      varTop: root.getPropertyValue("--safe-area-inset-top").trim(),
      varBottom: root.getPropertyValue("--safe-area-inset-bottom").trim(),
      width: innerWidth,
      height: innerHeight,
      ratio: devicePixelRatio,
      darkPhone: matchMedia("(prefers-color-scheme: dark)").matches,
      darkPage: document.documentElement.classList.contains("dark"),
    };
    probe.remove();
    return out;
  })()`);
  const pageHeightPx = Math.round(layout.height * layout.ratio);
  note(
    "layout",
    `page ${layout.width}x${layout.height} css px (x${layout.ratio} = ${pageHeightPx}px of ${screen.height}px), env top ${layout.envTop}px bottom ${layout.envBottom}px, Capacitor vars top ${layout.varTop || "none"} bottom ${layout.varBottom || "none"}`,
  );
  if (chrome >= 140) {
    // Edge to edge: the page fills the screen and is told where the bars are.
    check("the page draws edge to edge and knows the system bar insets", pageHeightPx >= screen.height - 8 && layout.envTop > 0, `env top ${layout.envTop}px`);
  } else {
    // Older WebView: Capacitor pads the page away from the bars instead.
    check("the page is padded clear of the system bars (WebView older than 140)", pageHeightPx < screen.height - 40 && layout.envTop === 0, `${pageHeightPx}px of ${screen.height}px`);
  }
  check("light phone, light page", !layout.darkPhone && !layout.darkPage);

  // --- 3. The sign-in page: no Google button in the app ---
  if (siteReady) {
    await dismissSystemDialogs();
    await page.run("document.querySelector('a[href=\"/login\"]').click()");
    check("a link opens the sign-in page", await waitFor(page, "location.pathname === '/login' && !!document.querySelector('input[type=email]')", 30_000));
    await sleep(600);
    const signIn = await page.run(`(() => {
      const shown = (el) => !!el && el.offsetParent !== null;
      const google = [...document.querySelectorAll("button")].find((b) => /Google/.test(b.textContent));
      const hint = [...document.querySelectorAll("p")].find((p) => /Account created with Google|Compte créé avec Google/.test(p.textContent));
      return { google: google ? shown(google) : "missing", hint: shown(hint), email: shown(document.querySelector("input[type=email]")) };
    })()`);
    check("Google's button is hidden in the app, the hint and the email form show", signIn.google === false && signIn.hint && signIn.email, JSON.stringify(signIn));
    capture("03-sign-in");

    // --- 4. The keyboard must not cover the field being typed in ---
    await page.run("document.querySelector('input[type=email]').scrollIntoView({ block: 'center' })");
    const box = await page.run("(() => { const r = document.querySelector('input[type=email]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
    await dismissSystemDialogs();
    // A real tap needs screen pixels: ask Android where the WebView sits
    // (on an old WebView the page starts below the status bar).
    const tree = sh("uiautomator dump /sdcard/ci-ui.xml >/dev/null 2>&1; cat /sdcard/ci-ui.xml");
    const bounds = /class="android\.webkit\.WebView"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tree);
    const before = await page.run("visualViewport.height");
    let focused = null;
    if (bounds) {
      sh(`input tap ${Number(bounds[1]) + Math.round(box.x * layout.ratio)} ${Number(bounds[2]) + Math.round(box.y * layout.ratio)}`);
      focused = await waitFor(page, "document.activeElement && document.activeElement.type === 'email'", 5000);
    }
    if (!focused) {
      // Same tap through the WebView's own input pipeline.
      const point = { x: Math.round(box.x), y: Math.round(box.y) };
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] }).catch(() => {});
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
      focused = await waitFor(page, "document.activeElement && document.activeElement.type === 'email'", 5000);
    }
    const keyboardUp = focused && (await waitUntil(() => /mInputShown=true/.test(sh("dumpsys input_method | grep mInputShown")), 8000));
    if (keyboardUp) {
      await sleep(1200);
      // The page shrinks when the keyboard's slide-in ends, which can take
      // more than the second above on a busy runner: wait for it, up to 8 s.
      await waitFor(page, `visualViewport.height < ${before} - 100`, 8000);
      await sleep(400);
      const after = await page.run("(() => { const r = document.activeElement.getBoundingClientRect(); return { viewport: visualViewport.height, fieldBottom: r.bottom, fieldTop: r.top }; })()");
      capture("04-keyboard");
      // What Android itself says, for the day the page does not shrink:
      // where the WebView sits with the keyboard up, and the window's mode.
      const withKeyboard = sh("uiautomator dump /sdcard/ci-ui-ime.xml >/dev/null 2>&1; cat /sdcard/ci-ui-ime.xml");
      const webViewNow = /class="android\.webkit\.WebView"[^>]*?bounds="(\[\d+,\d+\]\[\d+,\d+\])"/.exec(withKeyboard);
      const softInput = sh("dumpsys window windows | grep -m 3 -iE 'softInputMode|sim='").replace(/\s+/g, " ");
      note(
        "keyboard",
        `WebView ${bounds ? `[${bounds[1]},${bounds[2]}][${bounds[3]},${bounds[4]}]` : "?"} -> ${webViewNow ? webViewNow[1] : "?"}; ${softInput.slice(0, 300)}`,
      );
      check(
        "with the keyboard open the page shrinks and the field stays in view",
        after.viewport < before - 100 && after.fieldTop >= 0 && after.fieldBottom <= after.viewport + 1,
        `page ${before}px -> ${after.viewport}px, field ${Math.round(after.fieldTop)}-${Math.round(after.fieldBottom)}px`,
      );
      sh("input keyevent KEYCODE_BACK"); // closes the keyboard only
      await waitUntil(() => !/mInputShown=true/.test(sh("dumpsys input_method | grep mInputShown")), 5000);
    } else {
      note("keyboard", `not checked: ${focused ? "the emulator did not open its keyboard" : "the tap did not reach the email field"}`);
    }

    // --- 5. Back ---
    // Leave the field first: with a keyboard up, Back would only close it.
    await dismissSystemDialogs();
    await page.run("document.activeElement && document.activeElement.blur()").catch(() => {});
    await sleep(800);
    await page.run("window.__ciSamePage = true");
    sh("input keyevent KEYCODE_BACK");
    check("Back returns to the page before", await waitUntil(async () => (await pagePath(page)) === "/launch", 10_000), await pagePath(page));
    sh("input keyevent KEYCODE_BACK");
    const left = await waitUntil(() => !focusedWindow().includes(PKG), 10_000);
    check("Back on the first page puts the app in the background, still running", left && appPid() !== null, focusedWindow());
    // For reading the launch frames above: what the home screen measures.
    if (left) {
      await sleep(700);
      note("home screen brightness", brightness(capture(null)));
    }
    launch();
    const returned = await waitUntil(() => focusedWindow().includes(PKG), 10_000);
    check(
      "it comes back where it was, without reloading",
      returned && (await page.run("window.__ciSamePage === true && location.pathname === '/launch'").catch(() => false)),
    );
  }

  // --- 6. Cookies survive the app being closed (the session is a cookie) ---
  const stamp = `ci${Date.now()}`;
  await page.run(`document.cookie = "ci_probe=${stamp}; path=/; max-age=900; secure; samesite=lax"`);
  sh("input keyevent KEYCODE_HOME");
  await sleep(1500);
  sh(`am force-stop ${PKG}`);
  page.close();
  await sleep(500);
  launch();
  page = await connect();
  await waitFor(page, `location.origin === ${JSON.stringify(SITE)} && document.readyState === "complete"`, 60_000);
  const kept = await page.run(`document.cookie.includes("ci_probe=${stamp}")`);
  check("a cookie set a second before the app was closed is still there at the next launch", kept);
  await page.run('document.cookie = "ci_probe=; path=/; max-age=0; secure; samesite=lax"');
  await waitFor(page, splashGone, 30_000);

  await dismissSystemDialogs();

  // --- 7. Sharing a file: the app's cache folder to Android's share sheet ---
  const written = await page.run(
    "Capacitor.Plugins.Filesystem.writeFile({ path: 'shared/ci-check.txt', data: btoa('Linette emulator check'), directory: 'CACHE', recursive: true }).then((r) => r.uri, (e) => 'error: ' + (e && e.message))",
  );
  check("a file can be written to the app's cache folder", /^file:\/\/.*\/cache\/shared\/ci-check\.txt$/.test(written), written);
  await page.run(
    `window.__ciShare = "pending"; Capacitor.Plugins.Share.share({ files: [${JSON.stringify(written)}] }).then(() => { window.__ciShare = "resolved"; }, (e) => { window.__ciShare = "rejected: " + (e && e.message); }); true`,
  );
  const sheet = await waitUntil(() => /Chooser|intentresolver|ResolverActivity/i.test(focusedWindow()), 12_000);
  await sleep(1000);
  capture("05-share-sheet");
  check("Android's share sheet opens for that file", sheet, focusedWindow());
  sh("input keyevent KEYCODE_BACK");
  await waitUntil(() => focusedWindow().includes(PKG), 8000);
  note("share promise after the sheet was closed", await waitFor(page, "window.__ciShare !== 'pending' && window.__ciShare", 6000) ?? "still pending");

  // --- 7b. Photo fields: adding a piece starts with one ---
  // The site's fields are <input type="file" accept="image/*">, with
  // capture="environment" for the camera and "multiple" for the gallery.
  // The same two are created here (signed out, the real ones are behind
  // the sign-in) and clicked: Android must open its picker, and the
  // camera app for the capture one (which needs the <queries> entry in
  // the manifest, or the app can't see that a camera app exists).
  for (const field of [
    { name: "a photo field opens Android's picker", capture: false, opens: /documentsui|photopicker|providers\.media|Chooser|intentresolver/i },
    { name: "a camera field opens the camera app", capture: true, opens: /camera|permissioncontroller/i },
  ]) {
    await dismissSystemDialogs();
    await page.run(`(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      ${field.capture ? 'input.setAttribute("capture", "environment");' : "input.multiple = true;"}
      input.style.cssText = "position:fixed;left:0;top:0;opacity:0";
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 4000);
      return true;
    })()`);
    const leftApp = () => !/mCurrentFocus=Window\{[^}]*app\.linette\//.test(focusedWindow());
    const opened = await waitUntil(() => leftApp() && field.opens.test(focusedWindow()), 12_000);
    check(field.name, opened, focusedWindow());
    for (let i = 0; i < 4 && leftApp(); i++) {
      sh("input keyevent KEYCODE_BACK");
      await sleep(1200);
    }
    if (leftApp()) {
      launch();
      await waitUntil(() => !leftApp(), 8000);
    }
  }

  // --- 8. Dark mode follows the phone while the app is open ---
  sh("cmd uimode night yes");
  const wentDark = await waitFor(page, "matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.classList.contains('dark')", 15_000);
  await sleep(1200);
  const darkFrame = capture("06-launch-dark");
  check("switching the phone to dark turns the open page dark", wentDark, `frame brightness ${brightness(darkFrame)}`);
  // The clock and icons must contrast with what is behind them. Android's
  // own record of the focused window says which colour they have.
  // (The line lists the "light bar" flags and is missing or empty when
  // there are none, so the dump is only trusted if it is the real one.)
  const barIcons = () => {
    const dump = sh("dumpsys window");
    if (!/mCurrentFocus/.test(dump)) return null;
    return /mLastAppearance=[^\n]*LIGHT_STATUS_BARS/.test(dump) ? "dark" : "light";
  };
  if (barIcons() === null) note("status bar icons", "not readable on this Android version");
  else check("in dark mode the status bar icons are light", await waitUntil(() => barIcons() === "light", 6000), `icons: ${barIcons()}`);
  sh("cmd uimode night no");
  const wentLight = await waitFor(page, "!matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.classList.contains('dark')", 15_000);
  check("and back to light", wentLight);
  if (barIcons() !== null) check("in light mode they are dark", await waitUntil(() => barIcons() === "dark", 6000), `icons: ${barIcons()}`);

  // --- 9. No connection: the page that ships inside the app ---
  sh(`am force-stop ${PKG}`);
  page.close();
  const airplane = sh("cmd connectivity airplane-mode enable");
  if (/Exception|Unknown|not found/i.test(airplane)) sh("svc wifi disable; svc data disable");
  await sleep(3000);
  launch();
  page = await connect();
  const offline = await waitFor(page, "/can't be reached|Impossible de joindre/.test(document.body ? document.body.innerText : '')", 60_000);
  await sleep(500);
  capture("07-offline");
  check("without a connection the app shows its own offline page", offline, await page.run("location.href").catch((e) => e.message));
  sh("cmd connectivity airplane-mode disable; svc wifi enable; svc data enable");
  let back = false;
  for (let attempt = 0; attempt < 8 && !back; attempt++) {
    await sleep(8000);
    await page.run("(document.querySelector('a[lang=en]') || document.querySelector('a')).click()").catch(() => {});
    back = Boolean(await waitFor(page, `location.pathname === "/launch" && !!document.documentElement.getAttribute("data-locale")`, 12_000));
  }
  check("Try again loads the site once the connection is back", back, await page.run("location.href").catch((e) => e.message));
  // The offline page must not be left behind the site: Back on the first
  // page has to leave the app, not return to "can't be reached".
  if (back) {
    await dismissSystemDialogs();
    await waitFor(page, "document.readyState === 'complete'", 20_000);
    await sleep(2500);
    sh("input keyevent KEYCODE_BACK");
    const gone = await waitUntil(() => !focusedWindow().includes(PKG), 10_000);
    check("after the offline page, Back on the site's first page leaves the app", gone, gone ? "" : await page.run("location.href").catch((e) => e.message));
  }
} catch (error) {
  check("the check ran to the end", false, error?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(error));
  try {
    capture("99-where-it-stopped");
  } catch {}
} finally {
  page?.close();
  try {
    fs.writeFileSync(path.join(outDir, "logcat.txt"), adb(["logcat", "-d", "-t", "3000"]));
  } catch {}
}

// ---------- report ----------
if (closedDialogs.length) note("system dialogs closed during the run (\"isn't responding\")", closedDialogs.join(", "));
const failed = results.filter((r) => r.ok === false);
const crash = failed.length ? sh("logcat -d -b crash -t 40").trim() : "";
const lines = results.map((r) => `${r.ok === null ? "note" : r.ok ? "ok  " : "FAIL"}  ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
fs.writeFileSync(path.join(outDir, "report.txt"), `${lines.join("\n")}\n${crash ? `\n--- crash log ---\n${crash}\n` : ""}`);
const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const passed = results.filter((r) => r.ok === true).length;
const annotations = [
  `::notice title=Android emulator: ${passed} checks passed, ${failed.length} failed::${escape(lines.join("\n").slice(0, 6000))}`,
];
if (failed.length) {
  annotations.push(
    `::error title=Android emulator: ${failed.length} check(s) failed::${escape(
      // The tail of the crash log only when it is about the app: on one
      // image it was nothing but the screenshot tool crashing.
      `${failed.map((r) => `${r.name}${r.detail ? `: ${r.detail}` : ""}`).join("\n")}${crash.includes(PKG) ? `\n${crash.slice(-1500)}` : ""}`.slice(0, 6000),
    )}`,
  );
}
fs.writeFileSync(path.join(outDir, "annotations.txt"), `${annotations.join("\n")}\n`);
console.log(`\n${passed} passed, ${failed.length} failed. Report and screenshots: ${outDir}`);
process.exit(failed.length ? 1 : 0);
