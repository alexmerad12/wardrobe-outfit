import { describe, expect, it } from "vitest";
import { oneAtATime } from "./one-at-a-time";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("oneAtATime", () => {
  it("never runs two tasks at once, and keeps arrival order", async () => {
    const enqueue = oneAtATime();
    let running = 0;
    let maxRunning = 0;
    const order: number[] = [];
    const task = (n: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(15);
      order.push(n);
      running--;
      return n;
    };
    const results = await Promise.all([1, 2, 3].map((n) => enqueue(task(n))));
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxRunning).toBe(1);
  });

  it("keeps going after a task throws", async () => {
    const enqueue = oneAtATime();
    const failed = enqueue(async () => {
      throw new Error("bad photo");
    });
    const next = enqueue(async () => "ok");
    await expect(failed).rejects.toThrow("bad photo");
    await expect(next).resolves.toBe("ok");
  });

  it("tells a queued task how long it waited", async () => {
    const enqueue = oneAtATime();
    const first = enqueue(async (waited) => {
      await sleep(40);
      return waited;
    });
    const second = enqueue(async (waited) => waited);
    expect(await first).toBeLessThan(20);
    expect(await second).toBeGreaterThanOrEqual(30);
  });
});
