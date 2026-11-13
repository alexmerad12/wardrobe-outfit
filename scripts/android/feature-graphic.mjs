// The Google Play feature graphic (1024 x 500, no transparency): the
// brand as the app's own launch screen shows it. Black, the small caps
// line, "Linette" in the script face, the italic line under it.
//
//   node scripts/android/feature-graphic.mjs
//
// It draws a small page with the app's three typefaces (loaded from
// Google Fonts, so it needs a connection) in the headless browser the
// e2e tests already use, and saves store/android/feature-graphic.png.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = path.join(root, "store", "android", "feature-graphic.png");
const strings = JSON.parse(fs.readFileSync(path.join(root, "src", "lib", "i18n", "translations", "en.json"), "utf8")).splash;

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@1,400&family=DM+Sans:wght@500&family=Parisienne&display=block" />
    <style>
      html, body { margin: 0; width: 1024px; height: 500px; background: #000; color: #fff; }
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .tag { font: 500 22px/1 "DM Sans", sans-serif; letter-spacing: 0.42em; text-transform: uppercase; margin-right: -0.42em; opacity: 0.92; }
      .name { font: 400 190px/1 "Parisienne", cursive; margin: 26px 0 6px; }
      .sub { font: italic 400 30px/1 "Bodoni Moda", serif; opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="tag">${strings.tagline}</div>
    <div class="name">Linette</div>
    <div class="sub">${strings.subtitle}</div>
  </body>
</html>`;

const browser = await chromium.launch();
try {
  // Drawn at twice the size and scaled down: on Windows the browser
  // smooths small text with coloured sub-pixels, which show as fringes at
  // the final size. Scaling down turns them back into grey.
  const tab = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 2 });
  await tab.setContent(page, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  const loaded = await tab.evaluate(() =>
    ["Parisienne", "DM Sans", "Bodoni Moda"].map((family) => `${family}: ${[...document.fonts].some((face) => face.family.replace(/"/g, "") === family && face.status === "loaded")}`),
  );
  console.log("fonts loaded:", loaded.join(", "));
  if (loaded.some((line) => line.endsWith("false"))) throw new Error("a typeface did not load: check the connection");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const large = await tab.screenshot({ type: "png", omitBackground: false });
  await sharp(large).resize(1024, 500).flatten({ background: "#000000" }).png().toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
} finally {
  await browser.close();
}
