// One-off: generate the Open Graph / social preview image at 1200×630
// (the size Facebook / Twitter / LinkedIn / iMessage expect for shared
// linette.app links). Output goes to two places so Next.js App Router
// picks both up automatically:
//   src/app/opengraph-image.png   — default OG image for every route
//   src/app/twitter-image.png     — Twitter summary_large_image card
//
// Design: damask textile backdrop + bordered Parisienne-L disc on top
// + Linette wordmark + tagline below. Mirrors the launch-page hero
// composition, just landscape so it crops cleanly in social previews.
//
// Run: node scripts/make-og-image.mjs

import opentype from "opentype.js";
import sharp from "sharp";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FONT_PATH = path.join(root, "parisienne.ttf");
const OG_OUT = path.join(root, "src", "app", "opengraph-image.png");
const TW_OUT = path.join(root, "src", "app", "twitter-image.png");

if (!existsSync(FONT_PATH)) {
  console.error(
    `Missing ${FONT_PATH}. Run: curl -sSL --ssl-no-revoke -o ./parisienne.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf`
  );
  process.exit(1);
}

const buffer = readFileSync(FONT_PATH).buffer;
const font = opentype.parse(buffer);

// Extracts a Parisienne glyph (or word) as an SVG path, centered on
// (cx, cy) so the caller doesn't have to do bbox math.
function centerPath(text, fontSize, cx, cy) {
  const probe = font.getPath(text, 0, 0, fontSize);
  const bbox = probe.getBoundingBox();
  const w = bbox.x2 - bbox.x1;
  const h = bbox.y2 - bbox.y1;
  const x = cx - bbox.x1 - w / 2;
  const y = cy - bbox.y1 - h / 2;
  return {
    d: font.getPath(text, x, y, fontSize).toPathData(2),
    bbox,
    w,
    h,
  };
}

const W = 1200;
const H = 630;

// Disc sits centered horizontally, vertically slightly above middle
// to leave room for wordmark + tagline below it.
const discCx = W / 2;
const discCy = H * 0.40;
const discR = 130;

// L path inside the disc — same fontSize 200 the icon uses, so the
// proportions match (L/disc-diameter ≈ 0.77).
const lGlyph = centerPath("L", 200, discCx, discCy);

// "Linette" wordmark below the disc.
const wordCx = W / 2;
const wordCy = H * 0.72;
const wordmark = centerPath("Linette", 88, wordCx, wordCy);

// Eyebrow + tagline rendered as plain SVG <text> — the OG image is
// rasterized once at build time on this machine where Georgia is
// available, so we can rely on system fonts without shipping a TTF.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="bleed-fx" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="2.5"/>
    </filter>
    <g id="damask">
      <path d="M0 -18 Q 8 -10 0 0 Q -8 -10 0 -18 Z" fill="#000000" opacity="0.95"/>
      <path d="M0 0 Q 8 10 0 18 Q -8 10 0 0 Z" fill="#000000" opacity="0.95"/>
      <path d="M-18 0 Q -10 -8 0 0 Q -10 8 -18 0 Z" fill="#000000" opacity="0.9"/>
      <path d="M18 0 Q 10 -8 0 0 Q 10 8 18 0 Z" fill="#000000" opacity="0.9"/>
      <path d="M0 -17 Q 13 -23 16 -12 Q 14 -6 7 -8" fill="none" stroke="#000000" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>
      <path d="M0 -17 Q -13 -23 -16 -12 Q -14 -6 -7 -8" fill="none" stroke="#000000" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>
      <path d="M0 17 Q 13 23 16 12 Q 14 6 7 8" fill="none" stroke="#000000" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>
      <path d="M0 17 Q -13 23 -16 12 Q -14 6 -7 8" fill="none" stroke="#000000" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>
      <circle cx="0" cy="-24" r="1.2" fill="#000000" opacity="0.75"/>
      <circle cx="0" cy="24" r="1.2" fill="#000000" opacity="0.75"/>
      <circle cx="-24" cy="0" r="1" fill="#000000" opacity="0.65"/>
      <circle cx="24" cy="0" r="1" fill="#000000" opacity="0.65"/>
      <circle cx="0" cy="0" r="1.8" fill="#f4f4f4" opacity="0.55"/>
    </g>
    <pattern id="rd-tile" x="0" y="0" width="56" height="97" patternUnits="userSpaceOnUse">
      <rect width="56" height="97" fill="#ffffff"/>
      <g stroke="#1a1a1a" stroke-width="0.7" fill="none" opacity="0.5" stroke-linecap="round">
        <line x1="28" y1="24" x2="0"  y2="73"/>
        <line x1="28" y1="24" x2="56" y2="73"/>
        <line x1="28" y1="24" x2="0"  y2="-24"/>
        <line x1="28" y1="24" x2="56" y2="-24"/>
        <line x1="0"  y1="73" x2="28" y2="121"/>
        <line x1="56" y1="73" x2="28" y2="121"/>
      </g>
      <g transform="translate(28 24) scale(0.35)" filter="url(#bleed-fx)"><use href="#damask"/></g>
      <g transform="translate(0  73) scale(0.35)" filter="url(#bleed-fx)"><use href="#damask"/></g>
      <g transform="translate(56 73) scale(0.35)" filter="url(#bleed-fx)"><use href="#damask"/></g>
    </pattern>
    <radialGradient id="vig" cx="50%" cy="50%" r="60%">
      <stop offset="55%" stop-color="white" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.28"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="${H}" fill="url(#rd-tile)" opacity="0.42"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <text x="${W / 2}" y="${H * 0.13}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="18" letter-spacing="6"
        fill="rgba(0,0,0,0.6)" style="text-transform:uppercase;">
    Your AI Stylist
  </text>

  <circle cx="${discCx}" cy="${discCy}" r="${discR}" fill="#ffffff"/>
  <circle cx="${discCx}" cy="${discCy}" r="${discR}" fill="none" stroke="#000000" stroke-width="3" opacity="0.92"/>
  <circle cx="${discCx}" cy="${discCy}" r="${discR - 12}" fill="none" stroke="#000000" stroke-width="1" opacity="0.55"/>
  <circle cx="${discCx}"        cy="${discCy - 124}" r="2.1" fill="#000000" opacity="0.85"/>
  <circle cx="${discCx}"        cy="${discCy + 124}" r="2.1" fill="#000000" opacity="0.85"/>
  <circle cx="${discCx - 124}"  cy="${discCy}"        r="2.1" fill="#000000" opacity="0.85"/>
  <circle cx="${discCx + 124}"  cy="${discCy}"        r="2.1" fill="#000000" opacity="0.85"/>
  <path fill="#000000" d="${lGlyph.d}"/>

  <path fill="#000000" d="${wordmark.d}"/>

  <text x="${W / 2}" y="${H * 0.86}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-style="italic" font-size="22"
        fill="rgba(0,0,0,0.65)">
    for the closet you already own
  </text>
</svg>`;

await sharp(Buffer.from(svg), { density: 150 })
  .resize(W, H)
  .png({ compressionLevel: 9 })
  .toFile(OG_OUT);

copyFileSync(OG_OUT, TW_OUT);

const ogStat = readFileSync(OG_OUT).length;
console.log(`OG ${W}×${H} -> ${path.relative(root, OG_OUT)} (${(ogStat / 1024).toFixed(1)} KB)`);
console.log(`Twitter copy   -> ${path.relative(root, TW_OUT)}`);
