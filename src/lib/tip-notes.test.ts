import { describe, expect, it } from "vitest";
import {
  TIGHTS_NOTE,
  appendTipNote,
  dressyFabricNote,
  dropIntensifiers,
  lightForWeatherNote,
  mentionsTights,
  tidyTip,
} from "./tip-notes";

describe("mentionsTights", () => {
  it("finds tights in English and French, as whole words only", () => {
    expect(mentionsTights("Add sheer tights under the dress.")).toBe(true);
    expect(mentionsTights("Porte des collants bien chauds.")).toBe(true);
    expect(mentionsTights("Roll the sleeves once.")).toBe(false);
    expect(mentionsTights("tightsfit")).toBe(false);
    expect(mentionsTights(null)).toBe(false);
  });

  it("doesn't count the route's own tights line", () => {
    expect(mentionsTights(`Roll the sleeves once. ${TIGHTS_NOTE.en}`)).toBe(false);
    expect(mentionsTights(`Retrousse les manches. ${TIGHTS_NOTE.fr}`)).toBe(false);
  });
});

describe("dropIntensifiers", () => {
  it("removes the words that make a tip read machine-made", () => {
    expect(dropIntensifiers("Drape the blazer over your shoulders, looking effortlessly confident for the first date.")).toBe(
      "Drape the blazer over your shoulders, looking confident for the first date.",
    );
    expect(dropIntensifiers("Tuck the blouse in, you will look commanding and completely composed.")).toBe(
      "Tuck the blouse in, you will look commanding and composed.",
    );
    expect(dropIntensifiers("Rentre le pull, tu seras parfaitement à l'aise.")).toBe("Rentre le pull, tu seras à l'aise.");
    expect(dropIntensifiers("Drape the blazer over your shoulders: you'll look strikingly confident for date night.")).toBe(
      "Drape the blazer over your shoulders: you'll look confident for date night.",
    );
    expect(dropIntensifiers("Roule les manches, tu seras vraiment à l'aise.")).toBe("Roule les manches, tu seras à l'aise.");
  });

  it("leaves other words alone", () => {
    const tip = "Roll the sleeves twice, easy and warm for the movie marathon.";
    expect(dropIntensifiers(tip)).toBe(tip);
  });
});

describe("tidyTip", () => {
  it("joins the two parts with a colon instead of a semicolon", () => {
    expect(tidyTip("Cuff the coat's sleeves once; the shirt peeks, the structure softens.", "en")).toBe(
      "Cuff the coat's sleeves once: the shirt peeks, the structure softens.",
    );
    expect(tidyTip("Roule les manches une fois ; tu seras à l'aise pour le brunch.", "fr")).toBe(
      "Roule les manches une fois : tu seras à l'aise pour le brunch.",
    );
  });

  it("puts the French space before a colon, and nowhere else", () => {
    expect(tidyTip("Ceins le trench sans le boutonner entièrement: une allure affirmée pour ton rendez-vous.", "fr")).toBe(
      "Ceins le trench sans le boutonner entièrement : une allure affirmée pour ton rendez-vous.",
    );
    const french = "Laisse la veste ouverte : de l'allure pour ton rendez-vous de 18:30.";
    expect(tidyTip(french, "fr")).toBe(french);
    expect(tidyTip("Knot the scarf: you'll look sharp for date night.", "en")).toBe("Knot the scarf: you'll look sharp for date night.");
  });

  it("drops intensifiers too, and leaves a clean tip as it is", () => {
    expect(tidyTip("Half-tuck the knit, totally relaxed at home.", "en")).toBe("Half-tuck the knit, relaxed at home.");
    const tip = "Cuff the jeans once above the boots: easy for brunch, and warm enough for the cold.";
    expect(tidyTip(tip, "en")).toBe(tip);
  });
});

const TIP = "Roll the sleeves once so the knit reads relaxed.";

describe("appendTipNote", () => {
  it("adds a note after the tip", () => {
    expect(appendTipNote(TIP, TIGHTS_NOTE.en, "en")).toBe(`${TIP} ${TIGHTS_NOTE.en}`);
  });

  it("uses the note alone when there is no tip", () => {
    expect(appendTipNote(null, TIGHTS_NOTE.en, "en")).toBe(TIGHTS_NOTE.en);
    expect(appendTipNote("  ", TIGHTS_NOTE.fr, "fr")).toBe(TIGHTS_NOTE.fr);
  });

  it("never mentions tights twice: the weather note replaces the tights reminder", () => {
    const withTights = appendTipNote(TIP, TIGHTS_NOTE.en, "en");
    const note = lightForWeatherNote("en", true);
    expect(appendTipNote(withTights, note, "en")).toBe(`${TIP} ${note}`);
    const frTip = "Laisse la veste ouverte pour montrer le décolleté.";
    const frWithTights = appendTipNote(frTip, TIGHTS_NOTE.fr, "fr");
    const frNote = lightForWeatherNote("fr", true);
    expect(appendTipNote(frWithTights, frNote, "fr")).toBe(`${frTip} ${frNote}`);
  });

  it("keeps the tights reminder when the weather note doesn't cover tights", () => {
    const withTights = appendTipNote(TIP, TIGHTS_NOTE.en, "en");
    const note = lightForWeatherNote("en", false);
    expect(appendTipNote(withTights, note, "en")).toBe(`${TIP} ${TIGHTS_NOTE.en} ${note}`);
  });

  it("skips the tights reminder when the stylist already talked about tights", () => {
    const tip = "Slip on sheer black tights and cinch the dress at the waist.";
    expect(appendTipNote(tip, TIGHTS_NOTE.en, "en")).toBe(tip);
    expect(appendTipNote("Ajoute des collants fins et resserre la taille.", TIGHTS_NOTE.fr, "fr")).toBe(
      "Ajoute des collants fins et resserre la taille.",
    );
  });

  it("doesn't add the same note twice", () => {
    const once = appendTipNote(TIP, lightForWeatherNote("en", false), "en");
    expect(appendTipNote(once, lightForWeatherNote("en", false), "en")).toBe(once);
  });
});

describe("lightForWeatherNote", () => {
  it("names tights only when legs show, with no dash", () => {
    expect(lightForWeatherNote("en", true)).toMatch(/tights/);
    expect(lightForWeatherNote("en", false)).not.toMatch(/tights/);
    expect(lightForWeatherNote("fr", true)).toMatch(/collants/);
    for (const note of [lightForWeatherNote("en", true), lightForWeatherNote("fr", false)]) expect(note).not.toMatch(/[—–]/);
  });
});

describe("dressyFabricNote", () => {
  it("is a plain sentence: no occasion key, no cliché", () => {
    expect(dressyFabricNote("en")).toBe("A silk, satin, lace or velvet piece would dress it up.");
    expect(dressyFabricNote("fr")).toBe("Une pièce en soie, en satin, en dentelle ou en velours rendrait la tenue plus habillée.");
    for (const note of [dressyFabricNote("en"), dressyFabricNote("fr")]) {
      expect(note).not.toMatch(/dinner-out|elevate|rehausser/);
    }
  });
});
