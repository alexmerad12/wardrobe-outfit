import { describe, expect, it } from "vitest";
import { createUploadTracker } from "./unsaved-uploads";

// A promise the test settles by hand.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const removed: string[] = [];
  const tracker = createUploadTracker((path) => {
    removed.push(path);
  });
  return { removed, tracker };
}

describe("createUploadTracker", () => {
  it("removes a replaced photo, but only once its upload and cutout have settled", async () => {
    const { removed, tracker } = setup();
    const first = deferred<string | null>();
    tracker.track(first.promise);
    tracker.track(Promise.resolve("u/2-b.jpg"));
    await flush();
    // The first photo's cutout may still be on its way: removing the file
    // now would let it land again afterwards.
    expect(removed).toEqual([]);
    first.resolve("u/1-a.jpg");
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });

  it("removes the current photo when the screen goes away unsaved", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });

  it("keeps a photo whose save went through, even when it is replaced afterwards", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.saving("u/1-a.jpg", Promise.resolve(true));
    tracker.track(Promise.resolve("u/2-b.jpg"));
    tracker.saving("u/2-b.jpg", Promise.resolve(true));
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual([]);
  });

  it("waits for a save still on its way, then removes the photo if the save failed", async () => {
    const { removed, tracker } = setup();
    const save = deferred<boolean>();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.saving("u/1-a.jpg", save.promise);
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual([]);
    save.resolve(false);
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });

  it("treats a save that threw as not saved", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.saving("u/1-a.jpg", Promise.reject(new Error("offline")));
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });

  it("removes nothing for an upload that never landed or failed outright", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve(null));
    tracker.track(Promise.reject(new Error("upload failed")));
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual([]);
  });

  it("asks to remove each file once", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.abandonCurrent();
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });

  it("starts over cleanly after the current photo was abandoned", async () => {
    const { removed, tracker } = setup();
    tracker.track(Promise.resolve("u/1-a.jpg"));
    tracker.abandonCurrent();
    tracker.track(Promise.resolve("u/2-b.jpg"));
    tracker.saving("u/2-b.jpg", Promise.resolve(true));
    tracker.abandonCurrent();
    await flush();
    expect(removed).toEqual(["u/1-a.jpg"]);
  });
});
