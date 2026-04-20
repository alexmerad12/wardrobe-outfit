// One-off: rasterize the icon + splash SVGs to PNGs at all the sizes the
// PWA needs (iOS home-screen icon, Android icons, iOS splash screens).
//
// Run: node scripts/export-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const splashDir = path.join(publicDir, "splash");
mkdirSync(splashDir, { recursive: true });

const iconSvg = readFileSync(path.join(publicDir, "icon.svg"));
const splashSvg = readFileSync(path.join(publicDir, "splash.svg"));

// ---------- Icon sizes ----------
// PWA manifest + iOS home screen + Android launcher
const iconSizes = [
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

for (const { size, name } of iconSizes) {
  await sharp(iconSvg, { density: 400 })
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, name));
  console.log(`icon ${size}×${size} -> public/${name}`);
}

// ---------- Splash sizes (iOS) ----------
// Target the current iPhone lineup + iPad. Sharp renders the 1170×2532
// SVG and covers the target aspect ratio, so the gradient extends past
// the edges on wider devices (iPad) without any blank strips.
const splashSizes = [
  // iPhone 15/14 Pro Max, 15/14 Plus
  { w: 1290, h: 2796, name: "iphone-15-pro-max.png" },
  // iPhone 15/14 Pro, 15/14
  { w: 1179, h: 2556, name: "iphone-15-pro.png" },
  // iPhone 13/14 standard
  { w: 1170, h: 2532, name: "iphone-13.png" },
  // iPhone 13 mini / 12 mini
  { w: 1125, h: 2436, name: "iphone-mini.png" },
  // iPhone SE / 8
  { w: 750, h: 1334, name: "iphone-se.png" },
  // iPhone 11 / XR
  { w: 828, h: 1792, name: "iphone-xr.png" },
  // iPad Pro 11"
  { w: 1668, h: 2388, name: "ipad-11.png" },
  // iPad Pro 12.9"
  { w: 2048, h: 2732, name: "ipad-12-9.png" },
];

for (const { w, h, name } of splashSizes) {
  await sharp(splashSvg, { density: 300 })
    .resize(w, h, { fit: "cover", position: "center" })
    .png()
    .toFile(path.join(splashDir, name));
  console.log(`splash ${w}×${h} -> public/splash/${name}`);
}

console.log("\nDone.");
