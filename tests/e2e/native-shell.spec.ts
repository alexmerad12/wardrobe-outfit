import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// What the site does when it runs inside the Android app (a Capacitor
// shell that loads linette.app in a WebView: capacitor.config.ts,
// src/lib/native-shell.ts). The real app is built and driven on an
// emulator by .github/workflows/android.yml; here a browser plays its
// part: the app's user agent, and a stand-in for the bridge Capacitor
// injects, which records every call the site makes to it.

const APP_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 LinetteAndroid/1";
// A phone whose WebView is too old to draw under the system bars.
const OLD_WEBVIEW_UA = APP_UA.replace("Chrome/141.", "Chrome/120.");

type Call = { plugin: string; method: string; options?: Record<string, unknown> };
type ShellProbe = { calls: Call[]; back: ((event: { canGoBack?: boolean }) => void) | null };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __shell: ShellProbe }).__shell.calls);
const barStyles = async (page: Page) =>
  (await probe(page)).filter((c) => c.plugin === "SystemBars").map((c) => c.options?.style);

function installFakeBridge() {
  const state: ShellProbe = { calls: [], back: null };
  const record = (plugin: string, method: string) => async (options?: Record<string, unknown>) => {
    state.calls.push({ plugin, method, options });
    return method === "writeFile" ? { uri: `file:///data/user/0/app.linette/cache/${String(options?.path)}` } : {};
  };
  const w = window as unknown as { __shell: ShellProbe; Capacitor: unknown };
  w.__shell = state;
  w.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      App: {
        addListener: (event: string, listener: ShellProbe["back"]) => {
          if (event === "backButton") state.back = listener;
          return { remove: async () => {} };
        },
        minimizeApp: record("App", "minimizeApp"),
      },
      SystemBars: { setStyle: record("SystemBars", "setStyle") },
      Filesystem: { writeFile: record("Filesystem", "writeFile") },
      Share: { share: record("Share", "share") },
    },
  };
}

async function appPage(
  browser: Browser,
  options: { userAgent?: string; splash?: boolean; colorScheme?: "light" | "dark" } = {},
): Promise<Page> {
  const context = await browser.newContext({
    userAgent: options.userAgent ?? APP_UA,
    colorScheme: options.colorScheme ?? "light",
    viewport: { width: 412, height: 915 },
  });
  await context.addInitScript(installFakeBridge);
  if (!options.splash) {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("linette_splash_seen", "1");
      } catch {}
    });
  }
  return context.newPage();
}

test("the app shows no Google button and tells Google accounts how to get in; a browser is unchanged", async ({ browser }) => {
  // The mark on <html> comes from the pre-paint script, before the app's
  // own code: with that code blocked (and the service worker, as in
  // theme.spec.ts) it is already there.
  const bare = await browser.newContext({ userAgent: APP_UA, serviceWorkers: "block" });
  await bare.route(/\/_next\/static\/(?:.+\/)?chunks\/.+\.js/, (route) => route.abort());
  const barePage = await bare.newPage();
  await barePage.goto("/launch");
  expect(await barePage.locator("html").getAttribute("data-shell")).toBe("android");
  await bare.close();

  // The sign-in form is drawn by the browser: CSS reads that mark.
  for (const inApp of [true, false]) {
    const context = await browser.newContext(inApp ? { userAgent: APP_UA } : {});
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("linette_splash_seen", "1");
      } catch {}
    });
    const page = await context.newPage();
    await page.goto("/login");

    const google = page.getByRole("button", { name: /Google/ });
    const hint = page.getByText(/Account created with Google\?|Compte créé avec Google/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    expect(await page.locator("html").getAttribute("data-shell")).toBe(inApp ? "android" : null);
    if (inApp) {
      await expect(google).toBeHidden();
      await expect(hint).toBeVisible();
    } else {
      await expect(google).toBeVisible();
      await expect(hint).toBeHidden();
    }
    // The way in that works in both: email and password.
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await context.close();
  }
});

test("Back goes back one page, then puts the app in the background", async ({ browser }) => {
  const page = await appPage(browser);
  await page.goto("/launch");
  await page.waitForFunction(() => (window as unknown as { __shell: ShellProbe }).__shell.back !== null);

  await page.getByRole("link", { name: /^(Sign in|Se connecter)$/ }).click();
  await page.waitForURL("**/login");

  await page.evaluate(() => (window as unknown as { __shell: ShellProbe }).__shell.back!({ canGoBack: true }));
  await page.waitForURL("**/launch");
  expect((await probe(page)).filter((c) => c.plugin === "App")).toEqual([]);

  await page.evaluate(() => (window as unknown as { __shell: ShellProbe }).__shell.back!({ canGoBack: false }));
  await expect.poll(async () => (await probe(page)).filter((c) => c.plugin === "App").map((c) => c.method)).toEqual([
    "minimizeApp",
  ]);
  expect(new URL(page.url()).pathname).toBe("/launch");
  await page.context().close();
});

test("the status bar icons follow the page: light on the black splash, then the page's own mode", async ({ browser }) => {
  // A light phone, first visit: the black launch splash, then a light page.
  const page = await appPage(browser, { splash: true, colorScheme: "light" });
  await page.goto("/launch");
  await expect.poll(() => barStyles(page)).toEqual(["DARK"]);
  await expect(page.locator(".launch-splash")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => barStyles(page)).toEqual(["DARK", "LIGHT"]);

  // Settings → Appearance can differ from the phone: the class on <html>
  // is what the page looks like, so the icons follow it.
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect.poll(() => barStyles(page)).toEqual(["DARK", "LIGHT", "DARK"]);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect.poll(() => barStyles(page)).toEqual(["DARK", "LIGHT", "DARK", "LIGHT"]);
  await page.context().close();

  // A dark phone that already saw the splash: dark from the start.
  const dark = await appPage(browser, { colorScheme: "dark" });
  await dark.goto("/launch");
  await expect.poll(() => barStyles(dark)).toEqual(["DARK"]);
  await dark.context().close();

  // An old WebView is padded away from the bars and the strip behind them
  // takes the phone's colour: there the icons follow the PHONE (also
  // during the splash, and whatever the page's own mode), and keep
  // following it when it switches with the app open.
  const old = await appPage(browser, { userAgent: OLD_WEBVIEW_UA, splash: true, colorScheme: "light" });
  await old.goto("/launch");
  await expect.poll(() => barStyles(old)).toEqual(["LIGHT"]);
  await old.evaluate(() => document.documentElement.classList.add("dark"));
  await old.waitForTimeout(300);
  expect(await barStyles(old)).toEqual(["LIGHT"]);
  await old.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => barStyles(old)).toEqual(["LIGHT", "DARK"]);
  await old.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => barStyles(old)).toEqual(["LIGHT", "DARK", "LIGHT"]);
  await old.context().close();
});

test("in the app the data export goes to Android's share sheet, not to a download", async ({ browser }) => {
  assertE2EAccount();
  const page = await appPage(browser);
  let downloads = 0;
  page.on("download", () => downloads++);
  await signIn(page);
  await page.goto("/profile/settings/privacy");
  await page.getByRole("button", { name: /Download my data|Télécharger mes données/ }).click();

  await expect
    .poll(async () => (await probe(page)).filter((c) => c.plugin !== "SystemBars").map((c) => `${c.plugin}.${c.method}`), {
      timeout: 30_000,
    })
    .toEqual(["Filesystem.writeFile", "Share.share"]);
  const [written, shared] = (await probe(page)).filter((c) => c.plugin !== "SystemBars");

  // Written into the app's cache folder, as the JSON the API returned.
  expect(written.options?.directory).toBe("CACHE");
  expect(written.options?.recursive).toBe(true);
  expect(String(written.options?.path)).toMatch(/^shared\/[A-Za-z0-9._-]+\.json$/);
  const text = Buffer.from(String(written.options?.data), "base64").toString("utf8");
  expect(Object.keys(JSON.parse(text)).length).toBeGreaterThan(0);

  // Shared from where it was written.
  expect(shared.options?.files).toEqual([`file:///data/user/0/app.linette/cache/${String(written.options?.path)}`]);
  expect(downloads).toBe(0);
  await page.context().close();
});
