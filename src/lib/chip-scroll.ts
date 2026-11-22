// Brings a filter chip into view inside its own sideways-scrolling row.
//
// The row scrolls on its own: the page never moves. `scrollIntoView` would
// also scroll the page vertically whenever the sticky strip is slid away,
// which would undo the wardrobe's "back lands where you were" restore
// (src/lib/wardrobe-return.ts).

type Box = { left: number; width: number };

/**
 * How far the row must scroll so the chip's centre meets the row's centre
 * (negative: to the left). The browser clamps the result at the row's ends.
 */
export function chipCenteringDelta(row: Box, chip: Box): number {
  return chip.left + chip.width / 2 - (row.left + row.width / 2);
}

/** Centres `chip` in its parent row; instant unless `smooth`. */
export function centerChipInRow(chip: HTMLElement | null, smooth: boolean): void {
  const row = chip?.parentElement;
  if (!chip || !row) return;
  const left = chipCenteringDelta(row.getBoundingClientRect(), chip.getBoundingClientRect());
  if (Math.abs(left) < 1) return;
  row.scrollBy({ left, behavior: smooth ? "smooth" : "auto" });
}
