import type { Config } from "@imgly/background-removal";

// imgly's own defaults — isnet_fp16 model on CPU — are what the library is
// battle-tested with. Don't override the device or model here: specifying
// "gpu" can hang silently on browsers where WebGPU is exposed but not fully
// functional, and the model file for fp16 only loads cleanly at its default.
function getConfig(
  onProgress?: (key: string, current: number, total: number) => void
): Config {
  return {
    output: { format: "image/png", quality: 1 },
    progress: onProgress,
    debug: typeof process !== "undefined" && process.env.NODE_ENV !== "production",
  };
}

let preloaded: Promise<void> | null = null;

// Fetch model weights eagerly so the first click feels instant. Safe to call
// repeatedly — work is memoised. Returns a promise so callers that need to
// wait (auto-trigger on upload) can await it.
export function preloadBgRemoval(
  onProgress?: (key: string, current: number, total: number) => void
): Promise<void> {
  if (preloaded) return preloaded;
  preloaded = (async () => {
    try {
      const { preload } = await import("@imgly/background-removal");
      await preload(getConfig(onProgress));
    } catch (err) {
      console.error("bg-removal preload failed:", err);
      preloaded = null;
      throw err;
    }
  })();
  return preloaded;
}

export async function removeBg(
  image: Blob | File,
  onProgress?: (key: string, current: number, total: number) => void
): Promise<Blob> {
  // Ensure the model is ready. If preload hasn't been called yet, this awaits
  // the full download on-demand — slower on first use but never hangs.
  await preloadBgRemoval(onProgress);
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(image, getConfig(onProgress));
}
