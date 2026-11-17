import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// Inside the Android app on a current WebView (140+) the page is drawn under
// the status bar and the navigation bar, and env(safe-area-inset-*) gives
// their height (capacitor.config.ts: SystemBars, insetsHandling "css"). The
// Android 15 emulator in CI has WebView 124, where Capacitor pads the page
// instead, so this layout first ran on real phones, on 2026-11-16: the
// welcome page's top line sat under the clock and its Privacy · Terms links
// under the back and menu buttons. Every screen that fills the viewport by
// itself (position: fixed; inset: 0) skips the padding <main> gets in
// layout.tsx and has to add the insets on its own.
//
// Chromium fakes the two bars (DevTools: Emulation.setSafeAreaInsetsOverride).
// No text and no control may sit in either band: at the top of the page, and
// again scrolled to the end.

const APP_UA =
  "Mozilla/5.0 (Linux; Android 16; Pixel 10 Build/BP3A.251005.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.7444.102 Mobile Safari/537.36 LinetteAndroid/1";
// A punch-hole status bar and the three-button navigation bar.
const BARS = { top: 52, bottom: 48 };
const TALL = { width: 412, height: 915 };
const SHORT = { width: 360, height: 640 };

type Hit = { edge: "top" | "bottom"; what: string; from: number; to: number };

async function phone(browser: Browser, size: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ userAgent: APP_UA, viewport: size, colorScheme: "light" });
  // The launch splash plays once per session; the screens under it are tested.
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("linette_splash_seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);
  await devtools.send("Emulation.setSafeAreaInsetsOverride", { insets: BARS });
  return page;
}

// What sits under a bar, after scrolling every scroller to its start (the
// status bar) and then to its end (the navigation bar).
async function underTheBars(page: Page): Promise<{ insets: number[]; hits: Hit[] }> {
  return page.evaluate(async (bars) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const insets = [parseFloat(getComputedStyle(probe).paddingTop) || 0, parseFloat(getComputedStyle(probe).paddingBottom) || 0];
    probe.remove();

    const shown = (el: Element) => {
      if (el.closest('[aria-hidden="true"]')) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const content = () =>
      [...document.querySelectorAll("body *")].filter((el) => {
        const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
        const control = el.matches("a, button, input, select, textarea, label, [role=button], [role=checkbox], [role=radio], [role=switch]");
        if (!ownText && !control) return false;
        const r = el.getBoundingClientRect();
        // Screen-reader-only text is a 1 px box.
        return r.width > 1 && r.height > 1 && shown(el);
      });
    const name = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    const scrollers = [
      document.scrollingElement,
      ...[...document.querySelectorAll("body *")].filter((el) => {
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
      }),
    ].filter((el): el is Element => el !== null);

    const hits: { edge: "top" | "bottom"; what: string; from: number; to: number }[] = [];
    for (const s of scrollers) s.scrollTop = 0;
    await frame();
    for (const el of content()) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < bars.top) hits.push({ edge: "top", what: name(el), from: Math.round(r.top), to: Math.round(r.bottom) });
    }
    for (const s of scrollers) s.scrollTop = s.scrollHeight;
    await frame();
    const end = innerHeight - bars.bottom;
    for (const el of content()) {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > end) hits.push({ edge: "bottom", what: name(el), from: Math.round(r.top), to: Math.round(r.bottom) });
    }
    for (const s of scrollers) s.scrollTop = 0;
    return { insets, hits };
  }, BARS);
}

async function expectClearOfTheBars(page: Page, path: string, size: string) {
  // Pages that load their content after the first paint (the wardrobe grid,
  // the weather) settle first.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
  const { insets, hits } = await underTheBars(page);
  expect(insets, "the browser applies the faked bars").toEqual([BARS.top, BARS.bottom]);
  // Soft: one run lists every screen that collides, not just the first.
  expect.soft(hits, `${path} on a ${size} phone: text or controls under a system bar`).toEqual([]);
}

test.describe("screens keep clear of the phone's bars (edge to edge)", () => {
  test("signed out: the welcome, sign-in and document pages", async ({ browser }) => {
    for (const [size, viewport] of [["tall", TALL], ["short", SHORT]] as const) {
      const page = await phone(browser, viewport);
      for (const path of ["/launch", "/login", "/signup", "/forgot-password", "/privacy", "/terms", "/faq", "/delete-account"]) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expectClearOfTheBars(page, path, size);
      }
      await page.context().close();
    }
  });

  test("signed in: the app's screens", async ({ browser }) => {
    assertE2EAccount();
    for (const [size, viewport] of [["tall", TALL], ["short", SHORT]] as const) {
      const page = await phone(browser, viewport);
      await signIn(page);
      for (const path of ["/", "/wardrobe", "/suggest", "/outfits", "/profile", "/profile/settings"]) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : `${path}$`}`));
        await expectClearOfTheBars(page, path, size);
      }
      // The full-screen steps a signed-in account can still open. The
      // standing test account is past onboarding and predates the paywall:
      // a page that sends it elsewhere is reported and skipped, not failed.
      for (const path of ["/onboarding", "/paywall", "/paywall/success"]) {
        await page.goto(path);
        if (new URL(page.url()).pathname !== path) {
          test.info().annotations.push({ type: "skipped page", description: `${path} sent this account to ${new URL(page.url()).pathname}` });
          continue;
        }
        await expectClearOfTheBars(page, path, size);
      }
      await page.context().close();
    }
  });
});
