import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolvesToDark } from "./theme";

describe("theme choice", () => {
  it("only light and dark are stored choices, the rest follows the phone", () => {
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
    for (const raw of [null, undefined, "", "system", "auto", "DARK"]) {
      expect(parseThemeChoice(raw), String(raw)).toBe("system");
    }
  });

  it("a fixed choice wins over the phone, system follows it", () => {
    expect(resolvesToDark("dark", false)).toBe(true);
    expect(resolvesToDark("light", true)).toBe(false);
    expect(resolvesToDark("system", true)).toBe(true);
    expect(resolvesToDark("system", false)).toBe(false);
  });
});
