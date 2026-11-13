import { describe, expect, it } from "vitest";
import {
  barStyleFor,
  drawsUnderSystemBars,
  isShellUserAgent,
  safeFileName,
  shareFileThroughShell,
  shellPlugins,
  SHELL_UA_MARKER,
  webViewMajor,
} from "./native-shell";

// What the Android app's WebView sends (capacitor.config.ts appends the
// last word) and what Chrome on the same phone sends.
const APP_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 LinetteAndroid/1";
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

describe("isShellUserAgent", () => {
  it("recognises the app and nothing else", () => {
    expect(isShellUserAgent(APP_UA)).toBe(true);
    expect(isShellUserAgent(CHROME_UA)).toBe(false);
    expect(isShellUserAgent("")).toBe(false);
    expect(isShellUserAgent(null)).toBe(false);
    expect(isShellUserAgent(undefined)).toBe(false);
  });

  it("matches the suffix capacitor.config.ts adds", () => {
    // The config says "LinetteAndroid/1": the marker must stay its prefix.
    expect("LinetteAndroid/1".startsWith(SHELL_UA_MARKER)).toBe(true);
  });
});

describe("webViewMajor and drawsUnderSystemBars", () => {
  it("reads the Chromium version", () => {
    expect(webViewMajor(APP_UA)).toBe(141);
    expect(webViewMajor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBeNull();
    expect(webViewMajor(null)).toBeNull();
  });

  it("is true from WebView 140, the version Capacitor passes the insets through", () => {
    expect(drawsUnderSystemBars(APP_UA)).toBe(true);
    expect(drawsUnderSystemBars(APP_UA.replace("Chrome/141.", "Chrome/140."))).toBe(true);
    expect(drawsUnderSystemBars(APP_UA.replace("Chrome/141.", "Chrome/139."))).toBe(false);
    expect(drawsUnderSystemBars("no version here")).toBe(false);
  });
});

describe("barStyleFor", () => {
  it("asks for light icons on the black splash and in dark mode", () => {
    expect(barStyleFor({ dark: false, splash: true })).toBe("DARK");
    expect(barStyleFor({ dark: true, splash: false })).toBe("DARK");
    expect(barStyleFor({ dark: true, splash: true })).toBe("DARK");
  });

  it("asks for dark icons on a light page", () => {
    expect(barStyleFor({ dark: false, splash: false })).toBe("LIGHT");
  });
});

describe("safeFileName", () => {
  it("keeps ordinary names", () => {
    expect(safeFileName("linette-outfit-2026-11-13.png")).toBe("linette-outfit-2026-11-13.png");
    expect(safeFileName("linette-data.json")).toBe("linette-data.json");
  });

  it("cannot leave the folder it is written into", () => {
    expect(safeFileName("../../databases/secret.db")).toBe("databases-secret.db");
    expect(safeFileName("..")).toBe("file");
    expect(safeFileName("a/b\\c d.png")).toBe("a-b-c-d.png");
    expect(safeFileName("")).toBe("file");
  });

  it("stays short", () => {
    expect(safeFileName("x".repeat(500)).length).toBe(120);
  });
});

describe("outside the app", () => {
  it("has no plugins and shares nothing, so callers use their web path", async () => {
    expect(shellPlugins()).toBeNull();
    expect(await shareFileThroughShell(new Blob(["x"]), "x.txt")).toBeNull();
  });
});
