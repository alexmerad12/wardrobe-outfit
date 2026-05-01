/**
 * Compose a shareable outfit image on the client using Canvas.
 *
 * 1080×1920 portrait — Instagram-Stories-native 9:16. Minimal, items-first
 * editorial: title at the top, optional credit line beneath (weather ·
 * occasion · date), the lookbook grid filling the central canvas, and the
 * launch-page Monogram + spaced "CLOSETTE" wordmark anchored at the
 * bottom. Background is the same Rose & Damask textile as the launch
 * page (canvas-native port of the SVG pattern).
 *
 * Items arrive in the canonical head-to-toe order from orderOutfitItems
 * (top → bottom → outerwear → shoes → bag → accessory):
 *   1 item    → hero
 *   2–4 items → vertical single-column stack
 *   5+ items  → 2-column grid
 *
 * Each item sits on an ivory card with a hairline border + Bodoni-italic
 * caption. The credit line collapses cleanly when any field is omitted.
 */

import type { Category } from "./types";

export interface OutfitImageItem {
  name: string;
  image_url: string;
  thumbnail_url?: string | null;
  category?: Category;
}

export interface OutfitImageOptions {
  items: OutfitImageItem[];
  title: string;
  // Editorial credit-line fields. All optional — collapse cleanly when
  // omitted. weatherTemp is always Celsius (matches the DB) and the
  // formatter converts to display unit.
  weatherTemp?: number | null;
  weatherCondition?: string | null;
  occasion?: string | null;          // pre-localized label
  date?: string | Date | null;
  temperatureUnit?: "celsius" | "fahrenheit";
  // Manual override for the credit line. If set, replaces the auto-built
  // weather/occasion/date string.
  subtitle?: string;
}

// ── Canvas geometry ────────────────────────────────────────────────────────
const WIDTH = 1080;
const HEIGHT = 1920;        // 9:16 — Stories-native
const PADDING = 56;

// ── Brand palette — matches launch page Monogram + Rose & Damask ──────────
const INK = "#000000";
const IVORY = "#ffffff";
const HAIRLINE = "rgba(0,0,0,0.18)";
const MUTED = "rgba(0,0,0,0.55)";

const SERIF = '"Bodoni Moda", Georgia, "Times New Roman", serif';

// ── Image loading ──────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

// ── Path primitives ────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height;
  const br = w / h;
  let dw, dh;
  if (ir > br) {
    dw = w;
    dh = w / ir;
  } else {
    dh = h;
    dw = h * ir;
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// ── Rose & Damask textile (canvas port of patterns.tsx PatternRoseDamask) ──
// Faithful to the launch page wallpaper at the geometry level — same
// 56×97 tile, same three-medallion layout per tile, same diamond grid.
// Skips the SVG filter effects (fractalNoise/displacement) since those
// don't render reliably when an SVG is loaded via <img src="data:...">.

function drawDamaskMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Four petals — alpha set per-petal via fillStyle so the textile's
  // outer globalAlpha can multiply cleanly.
  const petal = (path: () => void, alpha: number) => {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    path();
    ctx.fill();
  };
  petal(() => {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(8, -10, 0, 0);
    ctx.quadraticCurveTo(-8, -10, 0, -18);
    ctx.closePath();
  }, 0.95);
  petal(() => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, 10, 0, 18);
    ctx.quadraticCurveTo(-8, 10, 0, 0);
    ctx.closePath();
  }, 0.95);
  petal(() => {
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.quadraticCurveTo(-10, -8, 0, 0);
    ctx.quadraticCurveTo(-10, 8, -18, 0);
    ctx.closePath();
  }, 0.9);
  petal(() => {
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.quadraticCurveTo(10, -8, 0, 0);
    ctx.quadraticCurveTo(10, 8, 18, 0);
    ctx.closePath();
  }, 0.9);

  // Curlicue ornaments at the four corners
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  const stroke = (path: () => void) => {
    path();
    ctx.stroke();
  };
  stroke(() => {
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.quadraticCurveTo(13, -23, 16, -12);
    ctx.quadraticCurveTo(14, -6, 7, -8);
  });
  stroke(() => {
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.quadraticCurveTo(-13, -23, -16, -12);
    ctx.quadraticCurveTo(-14, -6, -7, -8);
  });
  stroke(() => {
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.quadraticCurveTo(13, 23, 16, 12);
    ctx.quadraticCurveTo(14, 6, 7, 8);
  });
  stroke(() => {
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.quadraticCurveTo(-13, 23, -16, 12);
    ctx.quadraticCurveTo(-14, 6, -7, 8);
  });

  // Pearl accents at the cardinal points
  const pearl = (x: number, y: number, r: number, alpha: number) => {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  pearl(0, -24, 1.2, 0.75);
  pearl(0, 24, 1.2, 0.75);
  pearl(-24, 0, 1, 0.65);
  pearl(24, 0, 1, 0.65);
  // Center highlight
  ctx.fillStyle = "rgba(244,244,244,0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTextileBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Ivory ground
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, w, h);

  // Tile dimensions match patterns.tsx PatternRoseDamask (tile 56×97,
  // medallions at local (28,24), (0,73), (56,73)). The launch page
  // renders this at viewBox 2400×2400 — same scale-per-pixel here gives
  // ~33 motifs across a 1080-wide canvas, which reads as a fine textile.
  const scale = w / (56 * 18); // ~18 tiles wide — tighter than launch so
                                // the textile reads at thumbnail share-card sizes
  const tileW = 56 * scale;
  const tileH = 97 * scale;

  ctx.save();
  // Wrap the whole pattern at .32 opacity — matches the <g opacity={0.32}>
  // wrapper on the launch wallpaper so the C reads as primary.
  ctx.globalAlpha = 0.32;

  const sx = (n: number, originX: number) => originX + n * scale;
  const sy = (n: number, originY: number) => originY + n * scale;

  for (let ty = -tileH; ty < h + tileH; ty += tileH) {
    for (let tx = -tileW; tx < w + tileW; tx += tileW) {
      // Diamond grid — six edges per tile (four from the top medallion,
      // two completing the bottom triangle).
      ctx.strokeStyle = "rgba(26,26,26,0.55)";
      ctx.lineWidth = 0.7 * scale;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx(28, tx), sy(24, ty)); ctx.lineTo(sx(0, tx), sy(73, ty));
      ctx.moveTo(sx(28, tx), sy(24, ty)); ctx.lineTo(sx(56, tx), sy(73, ty));
      ctx.moveTo(sx(28, tx), sy(24, ty)); ctx.lineTo(sx(0, tx), sy(-24, ty));
      ctx.moveTo(sx(28, tx), sy(24, ty)); ctx.lineTo(sx(56, tx), sy(-24, ty));
      ctx.moveTo(sx(0, tx), sy(73, ty)); ctx.lineTo(sx(28, tx), sy(121, ty));
      ctx.moveTo(sx(56, tx), sy(73, ty)); ctx.lineTo(sx(28, tx), sy(121, ty));
      ctx.stroke();

      // Three medallions per tile — same .35 motif scale as on launch.
      drawDamaskMotif(ctx, sx(28, tx), sy(24, ty), 0.35 * scale);
      drawDamaskMotif(ctx, sx(0, tx), sy(73, ty), 0.35 * scale);
      drawDamaskMotif(ctx, sx(56, tx), sy(73, ty), 0.35 * scale);
    }
  }
  ctx.restore();

  // Editorial vignette — soft white halo where content sits, darker
  // corners so the centered logo group lifts forward (mirrors the
  // .launch-vignette CSS layer).
  const halo = ctx.createRadialGradient(w / 2, h * 0.42, 50, w / 2, h * 0.42, h * 0.65);
  halo.addColorStop(0, "rgba(255,255,255,0.55)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.5, w / 2, h / 2, Math.max(w, h) * 0.85);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// ── Brand mark — bordered-solid C, faithful to the launch-page Monogram ──
// Direct port of components/brand/monogram.tsx variant "bordered-solid":
//   r=88 ivory disc  +  1.4 outer hairline (ink, alpha .92)
//   r=80 inner hairline ring (ink, alpha .55, stroke .5)
//   four r=1.4 dots at radius 84
//   Bodoni C size 140
// All values scale from the original 200×200 viewBox; pass the desired
// final diameter as `size`.

function drawBrandMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 200; // viewBox-to-canvas scale
  // Solid ivory disc
  ctx.fillStyle = IVORY;
  ctx.beginPath();
  ctx.arc(cx, cy, 88 * s, 0, Math.PI * 2);
  ctx.fill();
  // Outer hairline (the launch-page disc border — thin, not bold)
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, 88 * s, 0, Math.PI * 2);
  ctx.stroke();
  // Inner hairline ring — twin-ring couture detail
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.6, 0.5 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, 80 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Four cardinal dots between the two rings (radius 84)
  ctx.save();
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.8;
  const dotR = Math.max(1.2, 1.4 * s);
  for (const angle of [0, 90, 180, 270]) {
    const rad = ((angle - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(rad) * 84 * s, cy + Math.sin(rad) * 84 * s, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Bodoni C — optically centered. textBaseline="middle" centers on the
  // em-square, but a serif capital with no descender sits visually high
  // inside the em, making the C look low in the disc. Measure the glyph's
  // actual ink bounds and offset off the alphabetic baseline so the visual
  // center of the C lands exactly at (cx, cy).
  ctx.fillStyle = INK;
  ctx.font = `400 ${Math.round(140 * s)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText("C");
  const visualCenterOffset =
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  ctx.fillText("C", cx, cy + visualCenterOffset);
}

// ── Date / credit formatting ──────────────────────────────────────────────

// Localized month + day, e.g. "April 30" (en) / "30 avril" (fr). Year is
// omitted because outfit shares are inherently current.
function formatShareDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(d);
  } catch {
    return d.toDateString();
  }
}

function formatTemp(c: number, unit: "celsius" | "fahrenheit"): string {
  if (unit === "fahrenheit") return `${Math.round((c * 9) / 5 + 32)}°F`;
  return `${Math.round(c)}°C`;
}

function buildCreditLine(opts: OutfitImageOptions): string | null {
  const parts: string[] = [];
  if (opts.weatherTemp != null) {
    parts.push(formatTemp(opts.weatherTemp, opts.temperatureUnit ?? "celsius"));
  }
  if (opts.weatherCondition) parts.push(opts.weatherCondition);
  if (opts.occasion) parts.push(opts.occasion);
  if (opts.date) {
    const d = opts.date instanceof Date ? opts.date : new Date(opts.date);
    if (!Number.isNaN(d.valueOf())) parts.push(formatShareDate(d));
  }
  if (parts.length === 0) return null;
  return parts.join("  ·  ");
}

// ── Layout ────────────────────────────────────────────────────────────────

interface Cell { x: number; y: number; w: number; h: number; }

function layoutCells(count: number, box: Cell): Cell[] {
  if (count === 1) return [box];
  // Single-column lookbook stack for ≤4 items; 2-col grid for 5+ so
  // photos still get usable height when the outfit gets layered.
  const useTwoCol = count >= 5;
  const rowGap = 24;
  const colGap = 20;
  if (!useTwoCol) {
    const h = (box.h - rowGap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => ({
      x: box.x, y: box.y + i * (h + rowGap), w: box.w, h,
    }));
  }
  const rows = Math.ceil(count / 2);
  const cw = (box.w - colGap) / 2;
  const ch = (box.h - rowGap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    return {
      x: box.x + col * (cw + colGap),
      y: box.y + row * (ch + rowGap),
      w: cw,
      h: ch,
    };
  });
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

function drawItemCell(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  img: HTMLImageElement,
  name: string,
  captionH: number
) {
  const cardR = 14;
  const photoH = cell.h - captionH;

  // Photo card — ivory, soft drop shadow so it lifts off the textile.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = IVORY;
  roundRect(ctx, cell.x, cell.y, cell.w, photoH, cardR);
  ctx.fill();
  ctx.restore();

  // Hairline border
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  roundRect(ctx, cell.x, cell.y, cell.w, photoH, cardR);
  ctx.stroke();

  // Photo (contained inside a small inner padding)
  const pad = 14;
  drawContained(ctx, img, cell.x + pad, cell.y + pad, cell.w - pad * 2, photoH - pad * 2);

  // Caption — Bodoni italic, muted ink, single line ellipsized
  if (captionH > 0 && name) {
    ctx.fillStyle = MUTED;
    const fs = Math.min(22, Math.max(14, captionH * 0.6));
    ctx.font = `italic ${fs}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = ellipsize(ctx, name, cell.w - 24);
    ctx.fillText(text, cell.x + cell.w / 2, cell.y + photoH + captionH / 2 + 4);
  }
}

// ── Composer ──────────────────────────────────────────────────────────────

export async function composeOutfitImage(opts: OutfitImageOptions): Promise<Blob> {
  const { items, title } = opts;
  if (items.length === 0) throw new Error("No items to render");

  // Make sure Bodoni Moda finishes loading so titles/captions don't fall
  // back to Georgia silently.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // ── Background: Rose & Damask textile + editorial vignette ──────────
  drawTextileBackground(ctx, WIDTH, HEIGHT);

  // ── Title (Bodoni, ink, large) ─────────────────────────────────────
  ctx.fillStyle = INK;
  ctx.font = `400 72px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleY = PADDING + 24;
  ctx.fillText(ellipsize(ctx, title, WIDTH - PADDING * 4), WIDTH / 2, titleY);

  // ── Credit line (single italic line under the title) ──────────────
  const credit = opts.subtitle ?? buildCreditLine(opts);
  let titleBottom = titleY + 90;
  if (credit) {
    ctx.fillStyle = MUTED;
    ctx.font = `italic 24px ${SERIF}`;
    ctx.fillText(credit, WIDTH / 2, titleY + 96);
    titleBottom = titleY + 134;
  }

  // ── Brand mark + wordmark (anchored at the bottom of the canvas) ──
  // Sized + spaced to match the launch page's bordered-solid Monogram
  // group. Sits above the bottom edge with comfortable breathing room.
  const markSize = 180;
  const wordmarkFs = 36;
  const bottomMargin = 72;
  const wordmarkY = HEIGHT - bottomMargin - wordmarkFs;
  const markCY = wordmarkY - markSize / 2 - 28;

  // ── Item lookbook (fills everything between the title and the mark) ─
  const gridBox: Cell = {
    x: PADDING + 12,
    y: titleBottom + 32,
    w: WIDTH - (PADDING + 12) * 2,
    h: (markCY - markSize / 2 - 36) - (titleBottom + 32),
  };

  const sources = items.map((it) => it.thumbnail_url || it.image_url);
  const imgs = await Promise.all(sources.map(loadImage));

  // Caption height scales down as items get more numerous so photos
  // breathe at any count.
  const captionH = items.length <= 2 ? 44 : items.length <= 4 ? 38 : 30;
  const cells = layoutCells(items.length, gridBox);
  for (let i = 0; i < items.length; i++) {
    drawItemCell(ctx, cells[i], imgs[i], items[i].name, captionH);
  }

  // Brand mark + spaced "CLOSETTE" wordmark — matches launch page group.
  drawBrandMark(ctx, WIDTH / 2, markCY, markSize);

  ctx.fillStyle = INK;
  ctx.font = `400 ${wordmarkFs}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "8px";
  ctx.fillText("CLOSETTE", WIDTH / 2, wordmarkY);
  ctx.letterSpacing = "0px";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode image"));
    }, "image/png");
  });
}

/**
 * Share an outfit image. Tries navigator.share({ files }) first; if that's
 * not supported (or the user cancels), falls back to downloading the PNG.
 */
export async function shareOutfitImage(
  blob: Blob,
  filename: string
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
