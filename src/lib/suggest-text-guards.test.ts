import { describe, expect, it } from "vitest";
import type { ClothingItem } from "@/lib/types";
import {
  hasStrippedAccents,
  hasVousForm,
  oneSentence,
  textGuardReason,
  textIsConsistent,
  textMentionsSwappedOut,
} from "./suggest-text-guards";

// Minimal items: the guards read category, subcategory, name, material, colors.
function item(name: string, category: string, subcategory: string | null, material: string[], colors: string[] = []) {
  return {
    id: name,
    name,
    category,
    subcategory,
    material,
    colors: colors.map((c) => ({ hex: "#000000", name: c, percentage: 50 })),
  } as unknown as ClothingItem;
}

const blackBoots = item("Black leather lace-up ankle boots", "shoes", "loafers", ["leather"], ["Black"]);
const taupeBoots = item("Taupe canvas lace-up ankle boots", "shoes", "loafers", ["canvas"], ["Taupe"]);
const hoka = item("Hoka Black and Blue Workout Sneakers", "shoes", "sneakers", ["other"], ["Black", "Blue"]);
const vans = item("Vans Flat Shoes", "shoes", "sneakers", ["cotton"], ["Black"]);
const blueTee = item("Blue cotton crewneck t-shirt", "top", "t-shirt", ["cotton"], ["Blue"]);
const olivePants = item("Olive green Roots sweatpants", "bottom", "sweatpants", ["cotton"], ["Olive"]);
const nikeHoodie = item("Grey Nike Zip-Up Hoodie", "outerwear", "hoodie", ["cotton"], ["Grey"]);
const blackShirt = item("Black button-front shirt", "top", "shirt", ["cotton"], ["Black"]);
const chinos = item("Beige cotton chino trousers", "bottom", "chinos", ["cotton"], ["Beige"]);
const blueJacket = item("Royal Blue Cotton Work Jacket", "outerwear", "jacket", ["cotton"], ["Royal Blue"]);
const suedeBomber = item("Tan suede bomber jacket", "outerwear", "bomber", ["suede"], ["Tan"]);
const rainJacket = item("Navy nylon rain jacket", "outerwear", "jacket", ["nylon"], ["Navy"]);

describe("oneSentence", () => {
  it("keeps only the first sentence", () => {
    expect(oneSentence("Sharp and clean. Then a second thought.")).toBe("Sharp and clean.");
    expect(oneSentence("  No terminal punctuation  ")).toBe("No terminal punctuation");
    expect(oneSentence(null)).toBe("");
  });
});

describe("textGuardReason", () => {
  const outfit = [blueTee, olivePants, nikeHoodie, hoka];

  it("passes a clean sentence", () => {
    expect(textGuardReason(outfit, "Cool blue against olive keeps the line grounded.")).toBeNull();
  });

  it("flags a garment category the outfit doesn't have", () => {
    expect(textGuardReason([blueTee, olivePants, hoka], "The moto jacket sharpens it.")).toMatch(/^garment:outerwear:/);
    expect(textGuardReason([blueTee, olivePants, hoka], "La veste structure la silhouette.", "fr")).toMatch(/^garment:outerwear:/);
  });

  it("does not read 'garde-robe' as a dress", () => {
    expect(textGuardReason(outfit, "Un classique de ta garde-robe, ancré et net.", "fr")).toBeNull();
  });

  it("flags garbled French characters", () => {
    expect(textGuardReason(outfit, "Une pi)ce dor)e illumine l'ensemble.", "fr")).toBe("corruption");
  });

  it("flags French in vous, but not 'rendez-vous' (a date)", () => {
    // Production, 2026-10-16: a refine answer saved on an outfit.
    expect(
      textGuardReason(outfit, "L'association de votre cardigan oversize et de votre t-shirt crée un jeu de textures.", "fr")
    ).toBe("vous");
    expect(textGuardReason(outfit, "Le contraste des textures est parfait pour un rendez-vous nocturne.", "fr")).toBeNull();
    // English text is never checked for French voice.
    expect(textGuardReason(outfit, "Vous is French for you.")).toBeNull();
  });

  it("flags French with stripped accents", () => {
    // Suggest on gemini-3.6-flash, 2026-10-16.
    const stripped = "L'association de la doudoune et du bas olive cree un contraste froid et structure pour l'exterieur.";
    expect(textGuardReason(outfit, stripped, "fr")).toBe("accents");
    expect(textIsConsistent(outfit, stripped.replace("cree", "crée").replace("exterieur", "extérieur"), "fr")).toBe(true);
  });
});

describe("hasVousForm / hasStrippedAccents", () => {
  it("catches vous-form imperatives and keeps tu-form ones", () => {
    expect(hasVousForm("Retroussez les manches.")).toBe(true);
    expect(hasVousForm("Retrousse les manches de ta veste.")).toBe(false);
    expect(hasVousForm("Pour ton rendez-vous, vous pouvez rentrer la chemise.")).toBe(true);
  });

  it("does not flag valid accentless French", () => {
    expect(hasStrippedAccents("Porte ta veste ouverte pour laisser deviner la superposition.")).toBe(false);
    expect(hasStrippedAccents("Une silhouette tres equilibree.")).toBe(true);
  });
});

describe("textMentionsSwappedOut", () => {
  it("catches a sentence about the shoe the repair swapped out", () => {
    // Benchmark sentences, 2026-10-16: the model's boots became sneakers.
    expect(
      textMentionsSwappedOut(
        "This look balances steel blue with olive, while the black leather boots anchor the casual silhouettes.",
        blackBoots,
        [blueTee, olivePants, nikeHoodie, hoka]
      )
    ).toBe(true);
    expect(
      textMentionsSwappedOut("Charcoal bottoms and leather footwear anchor the look.", blackBoots, [blueTee, olivePants, nikeHoodie, vans])
    ).toBe(true);
    expect(textMentionsSwappedOut("Sleek loafers sharpen the relaxed base.", blackBoots, [blueTee, olivePants, nikeHoodie, hoka])).toBe(
      true
    );
  });

  it("keeps a sentence that fits the final outfit", () => {
    const outfit = [blackShirt, chinos, blueJacket, blackBoots];
    expect(textMentionsSwappedOut("A deep black core with a vivid royal blue layer.", taupeBoots, outfit)).toBe(false);
    expect(textMentionsSwappedOut("Black leather ankle boots keep you dry and sharp.", taupeBoots, outfit)).toBe(false);
    expect(textMentionsSwappedOut("Clean sneakers keep the look easy.", blackBoots, [blueTee, olivePants, nikeHoodie, hoka])).toBe(false);
  });

  it("works for coats and in French", () => {
    const outfit = [blueTee, chinos, rainJacket, blackBoots];
    expect(textMentionsSwappedOut("The suede bomber adds warm texture.", suedeBomber, outfit)).toBe(true);
    expect(textMentionsSwappedOut("A navy jacket keeps the rain off.", suedeBomber, outfit)).toBe(false);
    expect(textMentionsSwappedOut("Le blouson en daim apporte de la chaleur.", suedeBomber, outfit, "fr")).toBe(true);
    expect(
      textMentionsSwappedOut("Les bottines en cuir noir ancrent la silhouette.", blackBoots, [blueTee, olivePants, nikeHoodie, hoka], "fr")
    ).toBe(true);
  });
});
