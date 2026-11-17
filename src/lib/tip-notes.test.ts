import { describe, expect, it } from "vitest";
import { TIGHTS_NOTE, appendTipNote, dropIntensifiers, lightForWeatherNote, mentionsTights } from "./tip-notes";

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
  });

  it("leaves other words alone", () => {
    const tip = "Roll the sleeves twice, easy and warm for the movie marathon.";
    expect(dropIntensifiers(tip)).toBe(tip);
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
