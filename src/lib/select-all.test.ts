import { describe, expect, it } from "vitest";
import { selectAll } from "./select-all";

// A fake table of n rows answering inclusive ranges, like PostgREST.
function table(n: number, cap = 1000) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { fetchPage, calls };
}

describe("selectAll", () => {
  it("reads past the 1,000-row cap", async () => {
    const t = table(1204);
    const rows = await selectAll(t.fetchPage);
    expect(rows).toHaveLength(1204);
    expect(rows[1203]).toBe(1203);
    expect(t.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const t = table(2000);
    expect(await selectAll(t.fetchPage)).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });

  it("returns an empty table without looping", async () => {
    const t = table(0);
    expect(await selectAll(t.fetchPage)).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });

  it("treats a null page as the end", async () => {
    const rows = await selectAll(async () => ({ data: null, error: null }));
    expect(rows).toEqual([]);
  });

  it("throws the database error instead of returning a short table", async () => {
    const boom = { message: "permission denied" };
    await expect(selectAll(async () => ({ data: null, error: boom }))).rejects.toBe(boom);
  });

  it("honours a smaller page size", async () => {
    const t = table(25);
    expect(await selectAll(t.fetchPage, 10)).toHaveLength(25);
    expect(t.calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });
});
