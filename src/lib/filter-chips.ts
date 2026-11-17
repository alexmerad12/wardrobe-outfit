// Filter chips that know how many results each one holds. The first chip
// ("All") stays first; after it come the chips with something behind them,
// in their usual order, and the empty ones go last (the owner's ask,
// 2026-11-16: on Favorites, "Work" sat in the middle of the row with no
// outfit behind it and nothing said so). The page greys the empty ones.

export interface CountedChip {
  key: string;
  count: number;
}

export function orderChipsByContent<T extends CountedChip>(chips: readonly T[]): (T & { empty: boolean })[] {
  if (chips.length === 0) return [];
  const [first, ...rest] = chips;
  const withContent = rest.filter((chip) => chip.count > 0);
  const empty = rest.filter((chip) => chip.count <= 0);
  return [
    { ...first, empty: first.count <= 0 },
    ...withContent.map((chip) => ({ ...chip, empty: false })),
    ...empty.map((chip) => ({ ...chip, empty: true })),
  ];
}
