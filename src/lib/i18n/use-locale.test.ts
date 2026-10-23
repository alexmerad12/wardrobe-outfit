import { afterEach, describe, expect, it, vi } from "vitest";

// The store reads localStorage and navigator once, lazily: load a fresh copy
// of the module for each browser setup.
async function freshStore(browserLanguage: string, cached: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubGlobal("navigator", { language: browserLanguage, languages: [browserLanguage] });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => cached[k] ?? null,
      setItem: () => {},
    },
  });
  vi.doMock("@/lib/preferences-client", () => ({ getPreferences: () => Promise.resolve(null) }));
  return (await import("./use-locale")).localeStore;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/preferences-client");
});

describe("localeStore before the server answers", () => {
  it("follows a French browser when nothing is cached (signed out, first visit)", async () => {
    const store = await freshStore("fr-CA");
    expect(store.getSnapshot().locale).toBe("fr");
  });

  it("follows an English browser when nothing is cached", async () => {
    const store = await freshStore("en-US");
    expect(store.getSnapshot().locale).toBe("en");
  });

  it("keeps the language last chosen on this device over the browser's", async () => {
    const store = await freshStore("fr-CA", { "locale:v1": "en" });
    expect(store.getSnapshot().locale).toBe("en");
  });
});
