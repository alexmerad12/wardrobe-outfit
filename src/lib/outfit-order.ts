import type { ClothingItem } from "./types";

// Display order for items in an outfit, used everywhere outfits get
// rendered (Suggest, today's outfit, recent outfits, favorites).
// Head-to-toe, accessories last:
//   top  → bottom → outerwear → shoes → bag → small accessories
//   dress / one-piece occupies the same slot as top+bottom.
//
// Stable: items with the same category preserve their original
// order so the user sees a deterministic layout.
const ORDER_RANK: Record<string, number> = {
  top: 1,
  bottom: 2,
  dress: 1,
  "one-piece": 1,
  outerwear: 3,
  shoes: 4,
  bag: 5,
  accessory: 6,
};

export function orderOutfitItems<T extends ClothingItem>(items: T[]): T[] {
  return [...items]
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const rankA = ORDER_RANK[a.item.category] ?? 9;
      const rankB = ORDER_RANK[b.item.category] ?? 9;
      if (rankA !== rankB) return rankA - rankB;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);
}
