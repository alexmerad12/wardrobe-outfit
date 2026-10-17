import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientPreferences } from "./preferences-client";

// Each getPreferences() call takes the next queued answer (none = signed out).
const answers: Promise<ClientPreferences | null>[] = [];
vi.mock("./preferences-client", () => ({
  getPreferences: vi.fn(() => answers.shift() ?? Promise.resolve(null)),
}));

import { createPreferenceStore } from "./preference-store";

const flush = () => new Promise((r) => setTimeout(r, 0));
const prefs = (p: Record<string, unknown>) => p as ClientPreferences;

function makeStore(cached: string | null = null) {
  const written: string[] = [];
  const applied: string[] = [];
  const store = createPreferenceStore<string>({
    serverValue: "en",
    readCache: () => cached,
    writeCache: (v) => written.push(v),
    fromPrefs: (p) => (p.language === "fr" ? "fr" : "en"),
    equals: (a, b) => a === b,
    apply: (v) => applied.push(v),
  });
  return { store, written, applied };
}

beforeEach(() => {
  answers.length = 0;
});

describe("createPreferenceStore", () => {
  it("renders the server value until hydration, the cached value after", () => {
    const { store } = makeStore("fr");
    expect(store.getServerSnapshot()).toBe("en");
    expect(store.getSnapshot()).toBe("fr");
  });

  it("applies the server's answer to every reader once it arrives", async () => {
    answers.push(Promise.resolve(prefs({ language: "fr" })));
    const { store, written } = makeStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    await flush();
    expect(store.getSnapshot()).toBe("fr");
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    expect(written).toEqual(["fr"]);
  });

  it("switches every mounted reader at once when the user saves", async () => {
    const { store, applied } = makeStore("en");
    const nav = vi.fn();
    const page = vi.fn();
    store.subscribe(nav);
    store.subscribe(page);
    await flush();
    store.saved(prefs({ language: "fr" }));
    expect(store.getSnapshot()).toBe("fr");
    expect(nav).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);
    expect(applied.at(-1)).toBe("fr");
  });

  it("ignores a server answer that was already on its way when the user saved", async () => {
    let answerOld!: (p: ClientPreferences | null) => void;
    answers.push(new Promise((r) => (answerOld = r)));
    const { store } = makeStore("en");
    store.subscribe(vi.fn());
    store.saved(prefs({ language: "fr" }));
    answerOld(prefs({ language: "en" }));
    await flush();
    expect(store.getSnapshot()).toBe("fr");
  });

  it("does not re-render anyone when nothing changed", async () => {
    answers.push(Promise.resolve(prefs({ language: "en" })));
    const { store } = makeStore("en");
    const reader = vi.fn();
    store.subscribe(reader);
    await flush();
    store.saved(prefs({ language: "en" }));
    expect(reader).not.toHaveBeenCalled();
  });

  it("stops notifying a reader once it unmounts", async () => {
    const { store } = makeStore("en");
    const reader = vi.fn();
    const unsubscribe = store.subscribe(reader);
    unsubscribe();
    store.saved(prefs({ language: "fr" }));
    expect(reader).not.toHaveBeenCalled();
  });

  it("applies the current value's side effect when a reader mounts", () => {
    const { store, applied } = makeStore("fr");
    store.subscribe(vi.fn());
    expect(applied).toEqual(["fr"]);
  });
});
