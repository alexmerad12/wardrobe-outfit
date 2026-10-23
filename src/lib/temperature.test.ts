import { describe, expect, it } from "vitest";
import { convertTemp, formatWind, resolveUnit } from "./temperature";

describe("formatWind", () => {
  it("keeps km/h for Celsius users", () => {
    expect(formatWind(6, "celsius", "en")).toBe("6 km/h");
    expect(formatWind(5.6, "celsius", "fr")).toBe("6 km/h");
  });

  it("converts to mph for Fahrenheit users, so the card never mixes °F with km/h", () => {
    expect(formatWind(16, "fahrenheit", "en")).toBe("10 mph");
    expect(formatWind(6, "fahrenheit", "en")).toBe("4 mph");
  });

  it("writes miles per hour the French way", () => {
    expect(formatWind(16, "fahrenheit", "fr")).toBe("10 mi/h");
  });
});

describe("convertTemp", () => {
  it("rounds both units", () => {
    expect(convertTemp(9, "fahrenheit")).toBe(48);
    expect(convertTemp(8.6, "celsius")).toBe(9);
  });
});

describe("resolveUnit", () => {
  it("prefers the saved city's country over the browser", () => {
    expect(resolveUnit("auto", { city: "Montreal, Quebec, Canada" })).toBe("celsius");
    expect(resolveUnit("auto", { city: "Austin, Texas, United States" })).toBe("fahrenheit");
  });

  it("reads the country in French too (device location answers in the user's language)", () => {
    expect(resolveUnit("auto", { city: "New York, États-Unis d'Amérique" })).toBe("fahrenheit");
    expect(resolveUnit("auto", { city: "Montréal, Canada" })).toBe("celsius");
    expect(resolveUnit("auto", { city: "George Town, Îles Caïmans" })).toBe("fahrenheit");
  });

  it("an explicit choice wins", () => {
    expect(resolveUnit("fahrenheit", { city: "Montreal, Quebec, Canada" })).toBe("fahrenheit");
  });
});
