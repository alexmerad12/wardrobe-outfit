import { describe, expect, it } from "vitest";
import { sanitizeAutoFill } from "./sanitize-autofill";

// Models return close-but-invalid enum values; a value outside the
// allowlist would fail a Supabase check constraint and kill the upload.
describe("sanitizeAutoFill names", () => {
  it("rewrites a title-case name in sentence case, leaves others alone", () => {
    expect(sanitizeAutoFill({ name: "Black Polyester Tank Top" }).name).toBe("Black polyester tank top");
    expect(sanitizeAutoFill({ name: "White Cotton T-Shirt" }).name).toBe("White cotton T-shirt");
    expect(sanitizeAutoFill({ name: "Leopard print slip-on sneakers" }).name).toBe("Leopard print slip-on sneakers");
    expect(sanitizeAutoFill({ name: "Bottines Noires En Cuir" }).name).toBe("Bottines noires en cuir");
  });
});

describe("sanitizeAutoFill", () => {
  it("normalises near-miss enum values and drops invalid ones", () => {
    const out = sanitizeAutoFill({
      category: "Shoes",
      subcategory: "ANKLE_BOOTS",
      material: ["Leather", "blue", "leather"],
      seasons: ["fall", "rainy"],
      occasions: ["casual", "date-night"],
    });
    expect(out.category).toBe("shoes");
    expect(out.subcategory).toBe("ankle-boots");
    expect(out.material).toEqual(["leather"]);
    expect(out.seasons).toEqual(["fall"]);
    expect(out.occasions).toEqual(["casual"]);
  });

  it("clamps warmth to 1-5 and rounds it", () => {
    expect(sanitizeAutoFill({ warmth_rating: 0 }).warmth_rating).toBe(1);
    expect(sanitizeAutoFill({ warmth_rating: 7.6 }).warmth_rating).toBe(5);
    expect(sanitizeAutoFill({ warmth_rating: 2.6 }).warmth_rating).toBe(3);
    expect(sanitizeAutoFill({ warmth_rating: "warm" }).warmth_rating).toBeUndefined();
  });

  it("keeps only valid hex colours, lowercased", () => {
    const out = sanitizeAutoFill({ colors: [{ hex: "#1A2B3C", name: " Navy " }, { hex: "navy", name: "Navy" }, null] });
    expect(out.colors).toEqual([{ hex: "#1a2b3c", name: "Navy" }]);
    expect(sanitizeAutoFill({ colors: [{ hex: "#zzz" }] }).colors).toBeUndefined();
  });

  it("trims the name and caps it at 80 characters", () => {
    expect(sanitizeAutoFill({ name: "  Black leather ankle boots  " }).name).toBe("Black leather ankle boots");
    expect(sanitizeAutoFill({ name: "x".repeat(120) }).name).toHaveLength(80);
    expect(sanitizeAutoFill({ name: "   " }).name).toBeUndefined();
  });

  it("survives garbage input", () => {
    expect(() => sanitizeAutoFill(null)).not.toThrow();
    expect(sanitizeAutoFill("not an object").pattern).toEqual([]);
  });
});
