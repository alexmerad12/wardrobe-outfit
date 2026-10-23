import { describe, expect, it } from "vitest";
import { isTitleCase, sentenceCaseIfTitled, toSentenceCase } from "./name-case";

describe("isTitleCase", () => {
  it("spots English title case", () => {
    expect(isTitleCase("Black Polyester Tank Top")).toBe(true);
    expect(isTitleCase("Bohème Assumé")).toBe(true);
  });
  it("leaves sentence case and single words alone", () => {
    expect(isTitleCase("White cotton tank top")).toBe(false);
    expect(isTitleCase("Jeans")).toBe(false);
    expect(isTitleCase("White V-neck tank top")).toBe(false);
  });
});

describe("toSentenceCase", () => {
  it("lowers every word after the first", () => {
    expect(toSentenceCase("Black Polyester Tank Top")).toBe("Black polyester tank top");
    expect(toSentenceCase("Audace Texturée Urban")).toBe("Audace texturée urban");
    expect(toSentenceCase("Chic Et Décontracté")).toBe("Chic et décontracté");
  });
  it("keeps T-shirt and V-neck spelled right", () => {
    expect(toSentenceCase("White Cotton T-Shirt")).toBe("White cotton T-shirt");
    expect(toSentenceCase("White V-Neck Tank Top")).toBe("White V-neck tank top");
    expect(toSentenceCase("Off-White Knee-Length Skirt")).toBe("Off-White knee-length skirt");
  });
  it("keeps acronyms and inner capitals", () => {
    expect(toSentenceCase("Rouge NYC")).toBe("Rouge NYC");
    expect(toSentenceCase("Navy McQueen Blazer")).toBe("Navy McQueen blazer");
  });
  it("capitalizes the first word and keeps apostrophes", () => {
    expect(toSentenceCase("élégance Du Soir")).toBe("Élégance du soir");
    expect(toSentenceCase("Look D'Automne")).toBe("Look d'automne");
  });
});

describe("sentenceCaseIfTitled", () => {
  it("only rewrites names in title case", () => {
    expect(sentenceCaseIfTitled("Blue Denim Jeans")).toBe("Blue denim jeans");
    expect(sentenceCaseIfTitled("Leopard print slip-on sneakers")).toBe("Leopard print slip-on sneakers");
  });
});
