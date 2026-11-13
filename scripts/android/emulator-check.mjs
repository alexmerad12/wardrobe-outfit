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
const appPid = () => {
  const pid = sh(`pidof ${PKG}`).trim().split(/\s+/)[0];
  return /^\d+$/.test(pid ?? "") ? pid : null;
};
function capture(name) {
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 256 * 1024 * 1024, timeout: 60_000 });
  if (name) fs.writeFileSync(path.join(outDir, `${name}.png`), png);
  return png;
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

function launch() {
  return sh(`am start -n ${ACTIVITY}`);
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
  const installLine = installed.split("\n").find((line) => /Success|Failure|Exception|Error/i.test(line)) ?? installed.trim().split("\n")[0] ?? "";
  if (!check("the app installs", /Success/.test(installed), installLine.trim().slice(0, 300))) throw new Error("install failed");

  // A freshly booted emulator says "boot completed" before its network is
  // up: the first run opened the app straight into its offline page. Wait
  // until Android itself has validated the connection.
  const online = await waitUntil(() => /Capabilities:[^\n]*\bVALIDATED\b/.test(sh("dumpsys connectivity")), 120_000, 2000);
  note("network", online ? "validated before the first launch" : "NOT validated after 2 minutes: the launch may end on the offline page");

  // --- 1. Cold start: what the first seconds look like ---
  sh("logcat -c");
  sh(`am force-stop ${PKG}`);
  const started = Date.now();
  const startOutput = launch();
  const frames = [];
  for (let i = 0; i < 9; i++) {
    const png = capture(i === 1 ? "01-launch-first-second" : null);
    frames.push({ at: ((Date.now() - started) / 1000).toFixed(1), light: brightness(png) });
    await sleep(250);
  }
  note("launch frames (seconds: brightness 0-255)", frames.map((f) => `${f.at}s:${f.light}`).join(" "));
  check("the app starts", appPid() !== null && !/Error|Exception/.test(startOutput), startOutput.trim().split("\n").pop());
  // The phone is in light mode. The system launch screen, then the site's
  // own, are both black: a bright frame in the first two seconds would be
  // an empty white window between them.
  const early = frames.filter((f) => Number(f.at) <= 2.5);
  check(
    "no white flash in the first seconds of a launch",
    early.length > 0 && early.every((f) => f.light >= 0 && f.light < 90),
    early.map((f) => f.light).join(","),
  );

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
  check(
    "the first launch opens the site's launch page (signed out)",
    landed,
    `${await page.run("location.href").catch((e) => e.message)} | app log: ${appLog || "nothing"}`,
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
    bridge.native && bridge.platform === "android" && ["App", "Filesystem", "Share", "SystemBars"].every((name) => bridge.plugins.includes(name)),
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
      const after = await page.run("(() => { const r = document.activeElement.getBoundingClientRect(); return { viewport: visualViewport.height, fieldBottom: r.bottom, fieldTop: r.top }; })()");
      capture("04-keyboard");
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
    await page.run("document.activeElement && document.activeElement.blur()").catch(() => {});
    await sleep(800);
    await page.run("window.__ciSamePage = true");
    sh("input keyevent KEYCODE_BACK");
    check("Back returns to the page before", await waitUntil(async () => (await pagePath(page)) === "/launch", 10_000), await pagePath(page));
    sh("input keyevent KEYCODE_BACK");
    const left = await waitUntil(() => !focusedWindow().includes(PKG), 10_000);
    check("Back on the first page puts the app in the background, still running", left && appPid() !== null, focusedWindow());
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

  // --- 8. Dark mode follows the phone while the app is open ---
  sh("cmd uimode night yes");
  const wentDark = await waitFor(page, "matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.classList.contains('dark')", 15_000);
  await sleep(1200);
  const darkFrame = capture("06-launch-dark");
  check("switching the phone to dark turns the open page dark", wentDark, `frame brightness ${brightness(darkFrame)}`);
  // The clock and icons must contrast with what is behind them. Android's
  // own record of the focused window says which colour they have.
  const barIcons = () => {
    const line = /mLastAppearance=([^\n]*)/.exec(sh("dumpsys window"))?.[1];
    return line === undefined ? null : /LIGHT_STATUS_BARS/.test(line) ? "dark" : "light";
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
      `${failed.map((r) => `${r.name}${r.detail ? `: ${r.detail}` : ""}`).join("\n")}${crash ? `\n${crash.slice(-1500)}` : ""}`.slice(0, 6000),
    )}`,
  );
}
fs.writeFileSync(path.join(outDir, "annotations.txt"), `${annotations.join("\n")}\n`);
console.log(`\n${passed} passed, ${failed.length} failed. Report and screenshots: ${outDir}`);
process.exit(failed.length ? 1 : 0);
