import { test, expect, type Route } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// The "Style Me" screen on a narrow phone, with no AI call: the outfit
// request is held in the browser (it never reaches the server), then
// answered by the test with the account's own pieces.
//  - The loader in the button cycles through phrases. At half the row the
//    longest one ("Reading weather") overflowed a 360 px phone and the
//    centred row was clipped at both ends, its icon cut in half
//    (2026-11-16). Back now steps aside while styling, and the loader
//    shortens its phrase before anything is clipped.
//  - A piece's name stops at two lines with "…". The padding used to sit on
//    the clamped line itself and 8 px of the third line showed through it
//    (outfit-piece-tile.tsx, "leopard print strap", 2026-11-16).

const LONG_NAME = "Black suede crossbody bag with gold chain and leopard print strap";

test("Style Me: the loader fits a narrow phone, and long piece names stop at two lines", async ({ browser }) => {
  assertE2EAccount();
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "en-US" });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("linette_splash_seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  await signIn(page);

  const listed = await page.request.get("/api/items");
  expect(listed.ok(), "the test account's wardrobe").toBe(true);
  const items = ((await listed.json()) as { id: string; name: string; category: string }[]).slice(0, 4);
  expect(items.length, "the test account has pieces to build an outfit from").toBeGreaterThanOrEqual(2);

  let held: Route | null = null;
  await page.route(/\/api\/suggest(\?|$)/, (route) => {
    held = route;
  });

  await page.goto("/suggest");
  await page.getByRole("button", { name: /^cozy$/i }).click({ timeout: 30_000 });
  for (let step = 0; step < 4; step++) {
    if (await page.getByRole("button", { name: /style me/i }).isVisible().catch(() => false)) break;
    await page.getByRole("button", { name: /^next$/i }).click();
  }
  await page.getByRole("button", { name: /^casual$/i }).click();
  const styleMe = page.getByRole("button", { name: /style me/i });
  const button = await styleMe.elementHandle();
  await styleMe.click();
  await expect.poll(() => held !== null, { message: "the outfit request is held" }).toBe(true);

  // While styling: no Back button beside it (the header's own back arrow
  // stays), and every phrase fits. The button's name is now the loader's
  // phrase, so it is reached through the handle taken before the tap.
  await page.waitForTimeout(300);
  const backBeside = await button!.evaluate((b) =>
    [...(b.parentElement?.querySelectorAll("button") ?? [])].some((x) => x !== b && /^back$/i.test((x.textContent ?? "").trim())),
  );
  expect.soft(backBeside, "Back steps aside while styling").toBe(false);
  const phases = new Set<string>();
  const problems: string[] = [];
  const until = Date.now() + 8_000; // the fourth phrase arrives after ~6.6 s
  while (Date.now() < until) {
    const m = await button!.evaluate((b) => {
      const s = getComputedStyle(b);
      const box = b.getBoundingClientRect();
      const left = box.left + parseFloat(s.paddingLeft) - 0.5;
      const right = box.right - parseFloat(s.paddingRight) + 0.5;
      const row = b.querySelector("div.flex") as HTMLElement | null;
      const svg = row?.querySelector("svg");
      // The icon shrinks to 75 % while it fades between tools: its box on
      // screen shows where it is, its CSS width whether the row squeezed it.
      const icon = svg?.getBoundingClientRect();
      const iconWidth = svg ? parseFloat(getComputedStyle(svg).width) : 0;
      const phrase = (row?.textContent ?? "").replace(/[.…]+\s*$/, "").trim();
      return {
        phrase,
        overflow: row ? row.scrollWidth - row.clientWidth : 0,
        iconInside: icon ? icon.left >= left && icon.right <= right && iconWidth >= 15 : false,
        rowInside: row ? row.getBoundingClientRect().left >= left && row.getBoundingClientRect().right <= right : false,
      };
    });
    if (m.phrase) phases.add(m.phrase);
    if (!m.iconInside || !m.rowInside || m.overflow > 1) problems.push(`${m.phrase}: icon inside ${m.iconInside}, row inside ${m.rowInside}, overflow ${m.overflow}px`);
    await page.waitForTimeout(250);
  }
  expect([...phases], "the loader reached the longest phrase").toContain("Reading weather");
  expect(problems, "nothing of the loader is clipped").toEqual([]);

  // Answer with an outfit of the account's own pieces, one with a long name.
  const outfit = items.map((item, i) => (i === 0 ? { ...item, name: LONG_NAME } : item));
  await held!.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      suggestions: [
        {
          items: outfit,
          reasoning: "Test outfit, answered by the test.",
          styling_tip: "A test tip.",
          name: "Test outfit",
          mood_match: "cozy",
          weather_temp: null,
          weather_condition: null,
        },
      ],
      wardrobe_gap: null,
    }),
  });

  const name = page.locator("p.line-clamp-2", { hasText: "Black suede crossbody" }).first();
  await expect(name).toBeVisible({ timeout: 30_000 });
  const lines = await name.evaluate((p) => {
    const box = p.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(p);
    const tops = [...new Set([...range.getClientRects()].map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    const lineHeight = parseFloat(getComputedStyle(p).lineHeight);
    return {
      laidOut: tops.length,
      shownLines: Math.round(box.height / lineHeight),
      thirdLinePainted: tops[2] === undefined ? 0 : Math.max(0, Math.round(box.bottom - tops[2])),
    };
  });
  expect(lines.laidOut, "the name is long enough to need a third line").toBeGreaterThanOrEqual(3);
  expect(lines.shownLines, "two lines shown").toBe(2);
  expect(lines.thirdLinePainted, "nothing of the third line shows").toBe(0);
  await context.close();
});
