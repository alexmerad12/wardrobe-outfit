import type { Config } from "@imgly/background-removal";

declare global {
  interface Navigator {
    gpu?: unknown;
  }
}

// Detect WebGPU once; GPU path is ~5-10x faster on supported browsers and
// produces identical output quality to CPU. Falls back cleanly when missing.
function hasWebGPU(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.gpu);
}

// Single source of truth for the model config. Used by both the eager
// `preloadBgRemoval()` warm-up and the actual `removeBg()` call, so the cached
// model weights from the warm-up are actually hit when the user clicks.
function getConfig(): Config {
  return {
    // Highest-quality isnet variant for clean edges on clothing photos.
    model: "isnet_fp16",
    device: hasWebGPU() ? "gpu" : "cpu",
    output: { format: "image/png", quality: 1 },
  };
}

let preloaded: Promise<void> | null = null;

// Fetch the model weights eagerly so the first click on "Remove background"
// is instant. Safe to call repeatedly — work is memoised.
export function preloadBgRemoval(): Promise<void> {
  if (preloaded) return preloaded;
  preloaded = (async () => {
    try {
      const { preload } = await import("@imgly/background-removal");
      await preload(getConfig());
    } catch {
      // Swallow — the actual `removeBg()` call will surface a real error
      // and we don't want to break the page if warm-up fails (e.g. WebGPU
      // init issue). Reset so a later attempt can retry.
      preloaded = null;
    }
  })();
  return preloaded;
}

export async function removeBg(image: Blob | File): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  try {
    return await removeBackground(image, getConfig());
  } catch (err) {
    // If GPU path failed (driver glitch, OOM), retry on CPU once before
    // giving up — the user still gets a clean cutout, just slower.
    if (hasWebGPU()) {
      return await removeBackground(image, { ...getConfig(), device: "cpu" });
    }
    throw err;
  }
}
