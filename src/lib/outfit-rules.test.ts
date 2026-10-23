import { describe, expect, it } from "vitest";
import type { ClothingItem } from "@/lib/types";
import {
  chroma,
  cozyPaletteClash,
  heelTooDressy,
  layersOverOversized,
  metalMixProblem,
  oversizedTop,
  shoeBottomClash,
  workDressProblem,
} from "./outfit-rules";

const item = (p: Partial<ClothingItem>) => p as ClothingItem;
const color = (name: string, hex: string) => ({ name, hex, percentage: 100 });

describe("metalMixProblem (one main metal + one accent)", () => {
  const goldBelt = item({ category: "accessory", subcategory: "belt", metal_finish: "gold" });
  const goldBag = item({ category: "bag", subcategory: "handbag", bag_metal_finish: "gold" });
  const silverShoes = item({ category: "shoes", subcategory: "heels", metal_finish: "silver" });
  const chromeShoes = item({ category: "shoes", subcategory: "boots", metal_finish: "chrome" });
  const copperBag = item({ category: "bag", subcategory: "handbag", bag_metal_finish: "copper" as ClothingItem["bag_metal_finish"] });
  const trackA = { mensTrack: false, playful: false };

  it("accepts a single metal family", () => {
    expect(metalMixProblem([goldBelt, goldBag], trackA)).toBeNull();
  });
  it("accepts a main metal on 2 pieces with a single accent", () => {
    expect(metalMixProblem([goldBelt, goldBag, silverShoes], trackA)).toBeNull();
  });
  it("refuses a one-and-one split", () => {
    expect(metalMixProblem([goldBelt, chromeShoes], trackA)).toMatch(/metal mismatch/);
  });
  it("refuses three families", () => {
    expect(metalMixProblem([goldBelt, silverShoes, copperBag], trackA)).toMatch(/metal mismatch/);
  });
  it("lets Playful mix anything", () => {
    expect(metalMixProblem([goldBelt, chromeShoes], { mensTrack: false, playful: true })).toBeNull();
  });
  it("leaves the bag out on the men's track", () => {
    expect(metalMixProblem([goldBelt, goldBag, silverShoes], { mensTrack: true, playful: false })).toMatch(/metal mismatch/);
  });
  it("ignores pieces with no metal or mixed metal", () => {
    const noMetal = item({ category: "shoes", subcategory: "sneakers", metal_finish: "none" });
    const mixed = item({ category: "bag", subcategory: "handbag", bag_metal_finish: "mixed" });
    expect(metalMixProblem([goldBelt, noMetal, mixed], trackA)).toBeNull();
  });
});

describe("cozyPaletteClash (earth tones are neutrals)", () => {
  const camelCoat = item({ name: "Camel coat", colors: [color("Camel", "#C19A6B")] });
  const sageKnit = item({ name: "Sage knit", colors: [color("Sage Green", "#9CAF88")] });
  const rustSweater = item({ name: "Rust sweater", colors: [color("Rust", "#B7410E")] });
  const emeraldSkirt = item({ name: "Emerald skirt", colors: [color("Emerald", "#50C878")] });
  const mutedPlum = item({ name: "Plum scarf", colors: [color("Plum", "#8E4585")] });

  it("lets a camel coat go with a sage sweater", () => {
    expect(cozyPaletteClash([camelCoat, sageKnit])).toBeNull();
  });
  it("flags a strong warm colour next to a strong cool one", () => {
    const clash = cozyPaletteClash([rustSweater, emeraldSkirt]);
    expect(clash?.warm.name).toBe("Rust sweater");
    expect(clash?.cool.name).toBe("Emerald skirt");
  });
  it("judges from the real colour: a muted plum doesn't clash", () => {
    expect(chroma("#8E4585")).toBeLessThan(0.3);
    expect(cozyPaletteClash([rustSweater, mutedPlum])).toBeNull();
  });
  it("treats one print carrying both colours as a designed palette", () => {
    const print = item({ name: "Paisley dress", colors: [color("Rust", "#B7410E"), color("Teal", "#008080")] });
    expect(cozyPaletteClash([print, camelCoat])).toBeNull();
  });
});

describe("shoeBottomClash", () => {
  const wideFull = item({ category: "bottom", subcategory: "trousers", bottom_fit: "wide-leg", pants_length: "full" });
  it("keeps flat sandals away from full wide-leg trousers", () => {
    const flat = item({ category: "shoes", subcategory: "sandals", heel_type: "flat" });
    expect(shoeBottomClash(flat, wideFull)).toMatch(/flat sandals/);
  });
  it("lets heeled, wedge or platform sandals go with them", () => {
    for (const heel of ["low-heel", "mid-heel", "high-heel", "wedge", "platform"] as const) {
      const s = item({ category: "shoes", subcategory: "sandals", heel_type: heel });
      expect(shoeBottomClash(s, wideFull), heel).toBeNull();
    }
  });
  it("counts an unknown heel height as flat", () => {
    expect(shoeBottomClash(item({ category: "shoes", subcategory: "sandals", heel_type: null }), wideFull)).not.toBeNull();
  });
  it("keeps the other proportion rules", () => {
    expect(shoeBottomClash(item({ category: "shoes", subcategory: "knee-boots" }), wideFull)).toMatch(/shaft conflict/);
    const wool = item({ category: "bottom", subcategory: "trousers", material: ["wool"] as ClothingItem["material"] });
    expect(shoeBottomClash(item({ category: "shoes", subcategory: "espadrilles" }), wool)).toMatch(/espadrilles/);
  });
});

describe("workDressProblem", () => {
  const blazer = item({ category: "outerwear", subcategory: "blazer" });
  const cardigan = item({ category: "top", subcategory: "cardigan" });
  const bodycon = (p: Partial<ClothingItem>) =>
    item({ category: "dress", dress_silhouette: "bodycon", subcategory: "midi-dress", is_neutral: true, ...p });

  it("never sends a slip or mermaid dress to work", () => {
    const slip = item({ category: "dress", dress_silhouette: "slip", subcategory: "midi-dress", is_neutral: true });
    expect(workDressProblem([slip, blazer])).toBe(slip);
  });
  it("allows a neutral, non-mini bodycon dress with a blazer or a cardigan", () => {
    expect(workDressProblem([bodycon({}), blazer])).toBeNull();
    expect(workDressProblem([bodycon({ subcategory: "maxi-dress" }), cardigan])).toBeNull();
  });
  it("refuses a mini, a colourful one, or one without a layer", () => {
    expect(workDressProblem([bodycon({ subcategory: "mini-dress" }), blazer])).not.toBeNull();
    expect(workDressProblem([bodycon({ is_neutral: false }), blazer])).not.toBeNull();
    expect(workDressProblem([bodycon({})])).not.toBeNull();
  });
  it("has nothing against a sheath", () => {
    expect(workDressProblem([item({ category: "dress", dress_silhouette: "sheath" })])).toBeNull();
  });
});

describe("heelTooDressy", () => {
  const mid = item({ category: "shoes", heel_type: "mid-heel" });
  const high = item({ category: "shoes", heel_type: "high-heel" });
  const low = item({ category: "shoes", heel_type: "low-heel" });
  it("allows mid heels at casual and brunch, not outdoors, travelling or at home", () => {
    expect(heelTooDressy(mid, "casual")).toBe(false);
    expect(heelTooDressy(mid, "brunch")).toBe(false);
    for (const o of ["outdoor", "travel", "at-home"]) expect(heelTooDressy(mid, o), o).toBe(true);
  });
  it("keeps high heels out of every casual occasion, fine elsewhere", () => {
    for (const o of ["casual", "brunch", "outdoor", "travel", "at-home"]) expect(heelTooDressy(high, o), o).toBe(true);
    expect(heelTooDressy(high, "date")).toBe(false);
    expect(heelTooDressy(high, "work")).toBe(false);
  });
  it("never minds a low heel", () => {
    expect(heelTooDressy(low, "outdoor")).toBe(false);
  });
});

describe("R4b layering proportions", () => {
  const tank = item({ category: "top", subcategory: "tank-top", fit: "regular" });
  const bigCardigan = item({ category: "top", subcategory: "cardigan", fit: "oversized", is_layering_piece: true });
  it("finds an oversized top even when it is a layering piece (the drift behind the 2026-10-23 empty answer)", () => {
    expect(oversizedTop([tank, bigCardigan])).toBe(bigCardigan);
    expect(oversizedTop([tank])).toBeUndefined();
  });
  it("lets only long coats and loose puffers over an oversized top", () => {
    expect(layersOverOversized(item({ category: "outerwear", subcategory: "trench-coat", fit: "regular" }))).toBe(true);
    expect(layersOverOversized(item({ category: "outerwear", subcategory: "puffer", fit: "loose" }))).toBe(true);
    expect(layersOverOversized(item({ category: "outerwear", subcategory: "puffer", fit: "slim" }))).toBe(false);
    expect(layersOverOversized(item({ category: "outerwear", subcategory: "vest", fit: "regular" }))).toBe(false);
    expect(layersOverOversized(item({ category: "outerwear", subcategory: "blazer", fit: "oversized" }))).toBe(false);
  });
});
