import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJsonObject, withModelFallback, withParseRetry } from "./gemini-retry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseJsonObject", () => {
  it("pulls the first JSON object out of an answer", () => {
    expect(parseJsonObject<{ a: number }>('Sure! {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(parseJsonObject("no json here")).toBeNull();
    expect(parseJsonObject(undefined)).toBeNull();
  });
});

describe("withParseRetry", () => {
  it("asks once more when the first answer can't be parsed", async () => {
    const answers = ['{"items": [', '{"items": []}'];
    const call = vi.fn(async () => answers.shift()!);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parsed } = await withParseRetry(call, (a) => JSON.parse(a) as { items: unknown[] });
    expect(call).toHaveBeenCalledTimes(2);
    expect(parsed).toEqual({ items: [] });
  });

  it("returns null after two unusable answers, without throwing", async () => {
    const call = vi.fn(async () => "not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parsed, answer } = await withParseRetry(call, (a) => JSON.parse(a));
    expect(call).toHaveBeenCalledTimes(2);
    expect(parsed).toBeNull();
    expect(answer).toBe("not json");
  });
});

describe("withModelFallback", () => {
  it("moves to the next model on a free-tier day cap, without retrying it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn(async (model: string) => {
      if (model === "flash") {
        throw new Error('429 RESOURCE_EXHAUSTED quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier"');
      }
      return `answer from ${model}`;
    });
    const out = await withModelFallback(["flash", "flash-lite"], call);
    expect(out).toEqual({ result: "answer from flash-lite", model: "flash-lite" });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["flash", "flash-lite"]);
  });

  it("does not fall back on an error any model would hit (400)", async () => {
    const call = vi.fn(async () => {
      throw new Error("400 INVALID_ARGUMENT: thinkingBudget is not supported");
    });
    await expect(withModelFallback(["flash", "flash-lite"], call)).rejects.toThrow(/400/);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty model list", async () => {
    await expect(withModelFallback([], async () => "x")).rejects.toThrow(/no models/);
  });
});
