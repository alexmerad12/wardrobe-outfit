// One-off: render the Linette wordmark in Parisienne as a PNG that can
// be referenced from transactional emails (where webfonts don't load
// reliably — Gmail in particular strips <style>@import).
//
// Outputs:
//   public/wordmark-linette.png   — 2x rendering for retina display
//
// Run: node scripts/make-wordmark.mjs

import opentype from "opentype.js";
import sharp from "sharp";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FONT_PATH = path.join(root, "parisienne.ttf");
const OUT_PATH = path.join(root, "public", "wordmark-linette.png");

if (!existsSync(FONT_PATH)) {
  console.error(
    `Missing ${FONT_PATH}. Run: curl -sSL --ssl-no-revoke -o ./parisienne.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf`
  );
  process.exit(1);
}

const buffer = readFileSync(FONT_PATH).buffer;
const font = opentype.parse(buffer);

// fontSize 200 chosen to make the wordmark ~roughly 600×200 — large
// enough to render crisply when the email displays it at ~280px wide,
// small enough to keep the PNG under ~10 KB.
const fontSize = 200;
const text = "Linette";

const probe = font.getPath(text, 0, 0, fontSize);
const bbox = probe.getBoundingBox();
const glyphW = bbox.x2 - bbox.x1;
const glyphH = bbox.y2 - bbox.y1;

// Pad around the glyph so the email can show the image without
// clipping the upper loops or lower curls. Parisienne extends well
// above cap height and below baseline.
const padX = 40;
const padY = 40;
const w = Math.ceil(glyphW + padX * 2);
const h = Math.ceil(glyphH + padY * 2);

// Position the glyph so its bbox top-left lands at (padX, padY).
const x = padX - bbox.x1;
const y = padY - bbox.y1;
const drawn = font.getPath(text, x, y, fontSize);
const d = drawn.toPathData(2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path fill="#000000" d="${d}"/></svg>`;

// Render at 2x of the display size used in email (~280px wide → 560px @ 2x)
// so the PNG looks crisp on retina but stays well under 15 KB. Aspect
// preserved automatically; height calculated from the SVG ratio.
const TARGET_W = 560;
const targetH = Math.round((h / w) * TARGET_W);

await sharp(Buffer.from(svg))
  .resize(TARGET_W, targetH)
  .png({ compressionLevel: 9, palette: true })
  .toFile(OUT_PATH);

const stat = readFileSync(OUT_PATH).length;
console.log(`Wordmark ${w}×${h} -> public/wordmark-linette.png (${(stat / 1024).toFixed(1)} KB)`);
