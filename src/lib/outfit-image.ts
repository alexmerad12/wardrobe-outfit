/**
 * Compose a shareable outfit image on the client using Canvas.
 *
 * Produces a 1080×1350 "polaroid"-style card: a small heading, a grid of
 * item photos (1–4 cells depending on item count), and a Closette footer.
 * Returns a PNG Blob ready to hand to navigator.share() or download.
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
const PADDING = 64;
const BG = "#fdfaf6";
const CARD = "#ffffff";
const TEXT = "#1a1a1a";
const MUTED = "#8a8680";
const BORDER = "rgba(0,0,0,0.06)";

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

// Draw an image into a box, preserving aspect ratio (contain).
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

// Layout: how to arrange N items on a grid inside the content box.
// Returns up to 4 cells; extras are dropped (we cap the visible grid at 4).
function gridCells(count: number, box: { x: number; y: number; w: number; h: number }) {
  const n = Math.min(count, 4);
  const gap = 24;
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
  const { items, title, subtitle, brand = "Closette" } = opts;
  if (items.length === 0) throw new Error("No items to render");

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Cream background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Inner card
  const cardX = PADDING;
  const cardY = PADDING;
  const cardW = WIDTH - PADDING * 2;
  const cardH = HEIGHT - PADDING * 2;
  ctx.fillStyle = CARD;
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Heading
  const headerX = cardX + 48;
  const headerY = cardY + 56;
  ctx.fillStyle = TEXT;
  ctx.font = "600 44px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, headerX, headerY);

  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 22px Inter, system-ui, sans-serif";
    ctx.fillText(subtitle, headerX, headerY + 60);
  }

  // Load item images (cap at 4 for the grid; drop any beyond)
  const imageSources = items.slice(0, 4).map((i) => i.thumbnail_url || i.image_url);
  const imgs = await Promise.all(imageSources.map(loadImage));

  // Content box for the grid
  const gridTop = headerY + (subtitle ? 130 : 100);
  const gridBottom = cardY + cardH - 140; // leave room for footer
  const gridBox = {
    x: cardX + 48,
    y: gridTop,
    w: cardW - 96,
    h: gridBottom - gridTop,
  };

  const cells = gridCells(imgs.length, gridBox);
  for (let i = 0; i < imgs.length; i++) {
    const cell = cells[i];
    // Soft backdrop per cell
    ctx.fillStyle = "#f6f3ee";
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 20);
    ctx.fill();
    drawContained(ctx, imgs[i], cell.x + 16, cell.y + 16, cell.w - 32, cell.h - 32);
  }

  // Footer — brand mark
  const footerY = cardY + cardH - 72;
  ctx.fillStyle = TEXT;
  ctx.font = "600 26px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.fillText(brand, WIDTH / 2, footerY);

  // Small accent line above footer
  const lineY = footerY - 20;
  ctx.fillStyle = MUTED;
  ctx.fillRect(WIDTH / 2 - 16, lineY, 32, 2);

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
      // User dismissed the share sheet — not an error.
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      // Fall through to download as a last resort.
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
