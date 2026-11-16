// Where the wardrobe grid was when the person opened a piece, so coming back
// (the app's arrow, the phone's Back, the browser's Back) lands on the same
// spot instead of the top of the page. The owner's ask, 2026-11-16: "it's item
// number 17 ... so I don't have to scroll all the way down".
//
// Neither the browser nor Next.js can do it alone: the grid mounts fresh on
// every visit and fetches its pieces after the first paint, so the page is six
// skeletons tall when they try to restore the position. The grid writes this
// record when a piece is opened and reads it once its pieces are on screen.
// One record per tab (sessionStorage), used once.

export const WARDROBE_RETURN_KEY = "linette_wardrobe_return";

/** A record older than this is ignored: the person has moved on. Long enough
 *  for a piece left open while they try it on or take its photo again. */
export const WARDROBE_RETURN_TTL_MS = 2 * 60 * 60 * 1000;

export interface WardrobeReturn {
  /** The grid's tab and drill-down, from `wardrobeViewKey`. */
  view: string;
  /** The piece opened, or the sibling the person swiped to from it. */
  itemId: string;
  /** That piece's card: distance from the top of the window, in px. */
  cardTop: number;
  /** The window's scroll position, in px (used when the card is gone). */
  scrollY: number;
  /** Date.now() when written. */
  at: number;
}

export function wardrobeViewKey(category: string, subcategory: string): string {
  return `${category}|${subcategory}`;
}

export function parseWardrobeReturn(
  raw: string | null,
  now: number
): WardrobeReturn | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { view, itemId, cardTop, scrollY, at } = value as Record<string, unknown>;
  if (typeof view !== "string" || typeof itemId !== "string" || !itemId) return null;
  if (!isFiniteNumber(cardTop) || !isFiniteNumber(scrollY) || !isFiniteNumber(at)) {
    return null;
  }
  // Too old, or written in the future (a clock change): ignore it.
  if (now - at > WARDROBE_RETURN_TTL_MS || at - now > 60_000) return null;
  return { view, itemId, cardTop, scrollY, at };
}

/** The scroll position that puts the card back where it was on screen: its
 *  position in the page minus its old distance from the top of the window.
 *  Without the card (deleted, moved to another tab) the old scroll position.
 *  Always inside the page. */
export function restoredScrollY(
  saved: Pick<WardrobeReturn, "cardTop" | "scrollY">,
  cardPageTop: number | null,
  maxScrollY: number
): number {
  const target = cardPageTop === null ? saved.scrollY : cardPageTop - saved.cardTop;
  return Math.max(0, Math.min(Math.round(target), Math.max(0, maxScrollY)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Storage can be blocked (private windows, strict settings): every access is
// guarded, and losing the record only means landing at the top as before.

export function saveWardrobeReturn(record: WardrobeReturn): void {
  try {
    sessionStorage.setItem(WARDROBE_RETURN_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked: the grid opens at the top, as it did before.
  }
}

export function readWardrobeReturn(now = Date.now()): WardrobeReturn | null {
  try {
    return parseWardrobeReturn(sessionStorage.getItem(WARDROBE_RETURN_KEY), now);
  } catch {
    return null;
  }
}

export function clearWardrobeReturn(): void {
  try {
    sessionStorage.removeItem(WARDROBE_RETURN_KEY);
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

/** The person swiped from the piece they opened to a sibling: come back to
 *  the sibling, which is the one on screen now. */
export function moveWardrobeReturn(itemId: string, now = Date.now()): void {
  const saved = readWardrobeReturn(now);
  if (!saved) return;
  saveWardrobeReturn({ ...saved, itemId, at: now });
}
