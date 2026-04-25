/**
 * Compose a shareable outfit image on the client using Canvas.
 *
 * Produces a 1080×1350 portrait card branded as Closette — Ivory · Noir.
 * Layout: editorial masthead → grid of item photos (1–4 cells) → maison
 * footer with the C monogram + Bodoni wordmark. Returns a PNG Blob ready
 * for navigator.share() or download.
 */

export interface OutfitImageItem {
  name: string;
  image_url: string;
  thumbnail_url?: string | null;
}

export interface OutfitImageOptions {
  items: OutfitImageItem[];
  title: string;      // "Today's Look" / "Ma tenue" / outfit name
  subtitle?: string;  // optional — e.g. the date, occasion
  brand?: string;     // defaults to "Closette"
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PADDING = 56;

// Brand palette — Ivory · Noir
const INK = "#0a0806";
const IVORY = "#ebe0c8";
const IVORY_HI = "#f8efd6";    // card surface — warmer than white but lighter than bg
const STEM = "#3a2a1e";        // hairlines
const CELL = "#ffffff";        // per-photo cell so clothing pops
const MUTED = "rgba(10,8,6,0.55)";
const HAIRLINE = "rgba(10,8,6,0.18)";

const SERIF = '"Bodoni Moda", Georgia, "Times New Roman", serif';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

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
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Tiny hairline horizontal rule.
function drawRule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  width: number,
  color: string = MUTED
) {
  ctx.fillStyle = color;
  ctx.fillRect(cx - width / 2, y, width, 1);
}

// The Ivory · Noir mark — a Bodoni "C" inside a hairline-bordered ivory
// disc with four cardinal dots. Mirrors the SVG monogram component so the
// shared image reads as the same logo people see on the launch page.
function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  const r = size / 2;
  // Solid ivory disc (matches the bg, but with a hairline outline so it
  // reads as a circle even though its fill matches the page).
  ctx.fillStyle = IVORY;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Outer hairline
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Inner thin ring
  ctx.lineWidth = 0.6;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy, r - r * 0.09, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Cardinal dots
  ctx.fillStyle = INK;
  for (const angle of [0, 90, 180, 270]) {
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = cx + Math.cos(rad) * (r - r * 0.045);
    const y = cy + Math.sin(rad) * (r - r * 0.045);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, size * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // The C — Bodoni, ink, geometrically centered.
  ctx.fillStyle = INK;
  ctx.font = `400 ${Math.round(size * 0.74)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("C", cx, cy);
}

function gridCells(count: number, box: { x: number; y: number; w: number; h: number }) {
  const n = Math.min(count, 4);
  const gap = 22;
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  if (n === 1) {
    cells.push(box);
  } else if (n === 2) {
    const cw = (box.w - gap) / 2;
    cells.push({ x: box.x, y: box.y, w: cw, h: box.h });
    cells.push({ x: box.x + cw + gap, y: box.y, w: cw, h: box.h });
  } else if (n === 3) {
    const topH = (box.h - gap) * 0.55;
    const botH = box.h - gap - topH;
    const cw = (box.w - gap) / 2;
    cells.push({ x: box.x, y: box.y, w: cw, h: topH });
    cells.push({ x: box.x + cw + gap, y: box.y, w: cw, h: topH });
    cells.push({ x: box.x, y: box.y + topH + gap, w: box.w, h: botH });
  } else {
    const cw = (box.w - gap) / 2;
    const ch = (box.h - gap) / 2;
    cells.push({ x: box.x, y: box.y, w: cw, h: ch });
    cells.push({ x: box.x + cw + gap, y: box.y, w: cw, h: ch });
    cells.push({ x: box.x, y: box.y + ch + gap, w: cw, h: ch });
    cells.push({ x: box.x + cw + gap, y: box.y + ch + gap, w: cw, h: ch });
  }
  return cells;
}

export async function composeOutfitImage(opts: OutfitImageOptions): Promise<Blob> {
  const { items, title, subtitle } = opts;
  if (items.length === 0) throw new Error("No items to render");

  // Wait for Bodoni Moda (loaded via next/font) to be ready before drawing
  // text — otherwise we fall back to Georgia silently.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Ivory page ground
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Inner card — ivory-light, hairline border, soft shadow
  const cardX = PADDING;
  const cardY = PADDING;
  const cardW = WIDTH - PADDING * 2;
  const cardH = HEIGHT - PADDING * 2;
  ctx.save();
  ctx.shadowColor = "rgba(58,42,30,0.18)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = IVORY_HI;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.stroke();

  // ── Masthead ──────────────────────────────────────────────────────────────
  // Eyebrow line above the title — sets the editorial tone.
  ctx.fillStyle = MUTED;
  ctx.font = `500 14px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("MAISON DE GARDE-ROBE", WIDTH / 2, cardY + 44);

  drawRule(ctx, WIDTH / 2, cardY + 76, 36, MUTED);

  // Title (Bodoni, ink)
  ctx.fillStyle = INK;
  ctx.font = `400 56px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, WIDTH / 2, cardY + 96);

  // Subtitle (italic Bodoni, muted)
  let gridTopOffset = cardY + 96 + 70;
  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = `italic 22px ${SERIF}`;
    ctx.fillText(subtitle, WIDTH / 2, cardY + 96 + 64);
    gridTopOffset = cardY + 96 + 110;
  }

  // ── Item grid ─────────────────────────────────────────────────────────────
  const imageSources = items.slice(0, 4).map((i) => i.thumbnail_url || i.image_url);
  const imgs = await Promise.all(imageSources.map(loadImage));

  // Reserve room at the bottom for the maison footer (~210px).
  const gridBottom = cardY + cardH - 210;
  const gridBox = {
    x: cardX + 44,
    y: gridTopOffset,
    w: cardW - 88,
    h: gridBottom - gridTopOffset,
  };

  const cells = gridCells(imgs.length, gridBox);
  for (let i = 0; i < imgs.length; i++) {
    const cell = cells[i];
    // White cell so clothing photos stay neutral.
    ctx.fillStyle = CELL;
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 16);
    ctx.fill();
    // Hairline frame
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 16);
    ctx.stroke();
    drawContained(ctx, imgs[i], cell.x + 16, cell.y + 16, cell.w - 32, cell.h - 32);
  }

  // ── Maison footer ─────────────────────────────────────────────────────────
  const footTop = cardY + cardH - 180;
  // Top hairline rule across the card width
  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(cardX + 80, footTop, cardW - 160, 1);

  // The C mark
  drawBrandMark(ctx, WIDTH / 2, footTop + 60, 60);

  // Wordmark
  ctx.fillStyle = INK;
  ctx.font = `400 30px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // Approximate letterspacing by drawing each glyph (canvas has no native
  // letter-spacing). Skip if ctx.letterSpacing is unsupported.
  const wordmark = "CLOSETTE";
  ctx.save();
  ctx.letterSpacing = "6px";
  ctx.fillText(wordmark, WIDTH / 2, footTop + 100);
  ctx.restore();

  // Tagline
  ctx.fillStyle = MUTED;
  ctx.font = `italic 18px ${SERIF}`;
  ctx.fillText("une garde-robe bien tenue", WIDTH / 2, footTop + 142);

  // Tiny stem-colored corner ornament for editorial weight.
  drawRule(ctx, WIDTH / 2, footTop + 176, 22, STEM);

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
 * Returns true if shared, false if downloaded.
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
