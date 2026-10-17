import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "@google/genai";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import("./gemini");
}

describe("model choice", () => {
  it("defaults to gemini-3.6-flash with Flash-Lite as each tier's fallback", async () => {
    vi.stubEnv("GEMINI_QUALITY_MODEL", "");
    const g = await load();
    expect(g.QUALITY_MODEL).toBe("gemini-3.6-flash");
    expect(g.QUALITY_MODELS).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(g.FAST_MODELS).toEqual(["gemini-3.5-flash-lite", "gemini-3.6-flash"]);
  });

  it("collapses to one model when the quality tier is pointed at Flash-Lite", async () => {
    vi.stubEnv("GEMINI_QUALITY_MODEL", "gemini-3.5-flash-lite");
    const g = await load();
    expect(g.QUALITY_MODELS).toEqual(["gemini-3.5-flash-lite"]);
    expect(g.FAST_MODELS).toEqual(["gemini-3.5-flash-lite"]);
  });
});

describe("thinkingFor", () => {
  it("sends suggest a thinking LEVEL (Gemini 3 Flash ignores thinkingBudget), LOW by default", async () => {
    vi.stubEnv("GEMINI_SUGGEST_THINKING_LEVEL", "");
    const g = await load();
    expect(g.thinkingFor("gemini-3.6-flash", "suggest")).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    expect(g.thinkingFor("gemini-3.5-flash-lite", "suggest")).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM });
  });

  it("follows GEMINI_SUGGEST_THINKING_LEVEL and ignores junk", async () => {
    vi.stubEnv("GEMINI_SUGGEST_THINKING_LEVEL", " Medium ");
    expect((await load()).thinkingFor("gemini-3.8-flash", "suggest")).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM });
    vi.stubEnv("GEMINI_SUGGEST_THINKING_LEVEL", "turbo");
    expect((await load()).thinkingFor("gemini-3.8-flash", "suggest")).toEqual({ thinkingLevel: ThinkingLevel.LOW });
  });

  it("turns thinking off the way each model accepts", async () => {
    const g = await load();
    // Flash-Lite rejects thinkingBudget (HTTP 400); 3.8 rejects level MINIMAL.
    expect(g.thinkingFor("gemini-3.6-flash", "none")).toEqual({ thinkingBudget: 0 });
    expect(g.thinkingFor("gemini-3.8-flash", "none")).toEqual({ thinkingBudget: 0 });
    expect(g.thinkingFor("gemini-3.5-flash-lite", "none")).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL });
  });
});
