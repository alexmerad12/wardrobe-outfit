// The Android app is this site inside the phone's WebView (a Capacitor
// shell: capacitor.config.ts, android/). Two things tell the site it runs
// there:
//  - the user agent ends with "LinetteAndroid/<n>" (appendUserAgent). The
//    pre-paint script in layout.tsx turns that into <html data-shell>, so
//    CSS can hide what can't work in the app (.web-only) and show what
//    only makes sense there (.shell-only) before the first frame.
//  - Capacitor injects window.Capacitor into every page it loads from
//    linette.app. Nothing of Capacitor is bundled in the site: the app's
//    plugins are reached through window.Capacitor.Plugins.
//
// An installed app can be older than the site (the site updates on every
// deploy, the app only when the person updates it), so every call checks
// that the plugin and the method exist. Never assume a plugin is there.

export const SHELL_UA_MARKER = "LinetteAndroid/";
/** Set on <html> before the first paint when the page runs in the app. */
export const SHELL_ATTRIBUTE = "data-shell";

export function isShellUserAgent(userAgent: string | null | undefined): boolean {
  return typeof userAgent === "string" && userAgent.includes(SHELL_UA_MARKER);
}

/** The WebView's Chromium major version, read from the user agent. */
export function webViewMajor(userAgent: string | null | undefined): number | null {
  const match = /Chrome\/(\d+)\./.exec(userAgent ?? "");
  return match ? Number(match[1]) : null;
}

// From this WebView version Capacitor lets the page draw under the system
// bars (SystemBars.java, WEBVIEW_VERSION_WITH_SAFE_AREA_FIX). Below it the
// page is padded away from the bars and the strip behind them takes the
// phone's own light or dark colour, so the bar icons follow the phone
// there, not the page (src/components/native-shell.tsx).
export const EDGE_TO_EDGE_WEBVIEW = 140;

export function drawsUnderSystemBars(userAgent: string | null | undefined): boolean {
  const major = webViewMajor(userAgent);
  return major !== null && major >= EDGE_TO_EDGE_WEBVIEW;
}

// Capacitor's names: "DARK" means a dark screen, so light icons; "LIGHT"
// means a light screen, so dark icons.
export type BarStyle = "DARK" | "LIGHT";

/** The system-bar icons the screen needs: the launch splash is black in
 *  both modes, everything else follows the page's light or dark mode. */
export function barStyleFor(screen: { dark: boolean; splash: boolean }): BarStyle {
  return screen.dark || screen.splash ? "DARK" : "LIGHT";
}

/** A file name that is safe as a path inside the app's cache folder. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  return cleaned.slice(0, 120) || "file";
}

type ListenerHandle = { remove?: () => unknown };

export type ShellPlugins = {
  App?: {
    addListener?: (
      event: "backButton",
      listener: (event: { canGoBack?: boolean }) => void,
    ) => ListenerHandle | Promise<ListenerHandle>;
    minimizeApp?: () => Promise<unknown>;
    exitApp?: () => Promise<unknown>;
  };
  SystemBars?: {
    setStyle?: (options: { style: BarStyle }) => Promise<unknown>;
  };
  Filesystem?: {
    writeFile?: (options: {
      path: string;
      data: string;
      directory: "CACHE";
      recursive?: boolean;
    }) => Promise<{ uri: string }>;
  };
  Share?: {
    share?: (options: { files: string[]; dialogTitle?: string }) => Promise<unknown>;
  };
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: ShellPlugins;
};

/** The app's plugins, or null in a browser. Call it in the browser only
 *  (an effect or an event handler), never during render. */
export function shellPlugins(): ShellPlugins | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!capacitor?.isNativePlatform?.() || !capacitor.Plugins) return null;
  return capacitor.Plugins;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Inside the app, hand a file to Android's share sheet (save it, send it,
 * post it). A WebView has neither the Web Share API nor downloads: an
 * <a download> click does nothing there. The file goes into the app's
 * cache folder first, which Android empties by itself when space runs low.
 *
 * Returns null in a browser, or in an app too old to have the two
 * plugins: the caller then uses its normal web path.
 */
export async function shareFileThroughShell(
  blob: Blob,
  fileName: string,
): Promise<"shared" | "cancelled" | null> {
  const plugins = shellPlugins();
  const writeFile = plugins?.Filesystem?.writeFile;
  const share = plugins?.Share?.share;
  if (!writeFile || !share) return null;

  const { uri } = await writeFile({
    path: `shared/${safeFileName(fileName)}`,
    data: await blobToBase64(blob),
    directory: "CACHE",
    recursive: true,
  });
  try {
    await share({ files: [uri] });
    return "shared";
  } catch (err) {
    // Closing the share sheet without choosing rejects with "Share canceled".
    const message = String((err as { message?: unknown })?.message ?? err);
    if (/cancel/i.test(message)) return "cancelled";
    throw err;
  }
}
