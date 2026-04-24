"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePendingUploads } from "@/lib/pending-uploads-context";
import { UploadPreviewImage } from "@/components/upload-preview-image";
import { preloadBgRemoval } from "@/lib/bg-removal";

// Full-screen processing page. After a user picks a batch we route them
// here immediately; the entire UI is consumed by upload progress so
// they're not tempted to wander off and lose work. When the last item
// settles, we redirect to the per-item review wizard automatically.
// There's always a visible cancel button — no user should ever feel
// "stuck" waiting for a batch.
export default function UploadingPage() {
  const router = useRouter();
  const { items, cancelAll, retry, dismiss } = usePendingUploads();
  const [navigated, setNavigated] = useState(false);

  // Kick off the imgly WASM download as soon as the user lands on
  // this page. Without this the first item's pipeline stalls for up
  // to 10 seconds on mobile waiting for the ~45 MB model to arrive;
  // preloading in parallel with the first upload hides that entirely.
  useEffect(() => {
    void preloadBgRemoval().catch(() => {});
  }, []);

  const counts = useMemo(() => {
    let queued = 0;
    let processing = 0;
    let ready = 0;
    let error = 0;
    for (const i of items) {
      if (i.stage === "queued") queued++;
      else if (i.stage === "processing") processing++;
      else if (i.stage === "ready") ready++;
      else if (i.stage === "error") error++;
    }
    return { queued, processing, ready, error, total: items.length };
  }, [items]);

  const inFlight = counts.queued + counts.processing;
  const pct = counts.total > 0 ? Math.round((counts.ready / counts.total) * 100) : 0;

  // Watch the items directly instead of a fire-and-forget event. This
  // fixes a race where the batch could settle between the router.push()
  // that brought us here and this page actually mounting — the event
  // would fire into an empty listener set and the user would be
  // stranded on "Uploading..." forever. State-based detection also
  // handles the re-mount case: if the user comes back to this page
  // after a batch already completed, we notice immediately and route
  // them forward.
  useEffect(() => {
    if (navigated) return;
    // Nothing pending → send them home, but DEBOUNCE the redirect.
    // When the user lands here via router.push() from /wardrobe, the
    // setItems() that added their batch can commit a React tick or two
    // AFTER this page mounts, so items is transiently [] at first
    // paint. Without the delay we immediately bounce back to /wardrobe
    // and the upload never happens. 500 ms is imperceptible to a user
    // who genuinely meant to land on an empty uploading page, and
    // gives the pending context plenty of time to hydrate.
    if (items.length === 0) {
      const timer = setTimeout(() => router.replace("/wardrobe"), 500);
      return () => clearTimeout(timer);
    }
    const settled = items.every(
      (i) => i.stage === "ready" || i.stage === "error"
    );
    if (!settled) return;
    const readyIds = items
      .filter((i) => i.stage === "ready" && i.savedItemId)
      .map((i) => i.savedItemId!);
    if (readyIds.length === 0) return; // only errors — stay here, show retry UI
    setNavigated(true);
    const [firstId, ...rest] = readyIds;
    const qs = new URLSearchParams({ edit: "1" });
    if (rest.length > 0) qs.set("next", rest.join(","));
    router.replace(`/wardrobe/${firstId}?${qs.toString()}`);
  }, [items, navigated, router]);

  function handleCancel() {
    cancelAll();
    router.replace("/wardrobe");
  }

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <div className="mx-auto max-w-md min-h-screen flex flex-col px-5 pt-6 pb-24">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#7c2d3a]" />
            <h1 className="text-lg font-semibold text-[#7c2d3a]">
              Uploading your closet
            </h1>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>

        {/* Big progress */}
        <div className="rounded-2xl border border-[#e8b4bc] bg-[#fdf2f4] p-6 text-center mb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            {inFlight > 0 ? (
              <Loader2 className="h-10 w-10 animate-spin text-[#7c2d3a]" />
            ) : (
              <Sparkles className="h-10 w-10 text-[#7c2d3a]" />
            )}
          </div>
          <p className="text-2xl font-semibold text-[#7c2d3a]">
            {counts.ready} / {counts.total}
          </p>
          <p className="mt-1 text-sm text-[#9b4050]/80">
            {inFlight > 0
              ? `Processing ${counts.processing || counts.queued} of ${counts.total}…`
              : counts.error > 0 && counts.ready === 0
              ? "Every upload failed — tap Retry below"
              : "Wrapping up"}
          </p>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#f4d3d9]">
            <div
              className="h-full bg-[#7c2d3a] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="mb-4 text-xs text-center text-muted-foreground/80">
          Feel free to browse the app — just don&apos;t close the tab.
          We&apos;ll open the review screen when every item is ready.
        </p>

        {/* Photo tips — visible DURING upload so users see the
            guidance while they're still forming habits. Previously
            tucked in the + dropdown where nobody found them. The
            three rules map 1:1 to the failure modes we see in
            practice: bg removal leaves artefacts when the backdrop
            is cluttered, the AI mislabels when multiple items are
            in frame, and cropped shots lose sleeves/hems. */}
        <div className="mb-4 rounded-lg bg-[#fdf2f4] border border-[#e8b4bc] px-3 py-2.5 text-xs text-[#7c2d3a]">
          <p className="font-medium mb-1">Tips for clean backgrounds</p>
          <ul className="space-y-0.5 text-[#9b4050]/90">
            <li>• One item per photo, fully visible (no cropped edges)</li>
            <li>• Flat surface for tops, pants, knits — bed, table, floor</li>
            <li>• Hanger for coats, blazers, dresses, long skirts</li>
            <li>• Good light, no strong shadows</li>
          </ul>
        </div>

        {/* Tile grid */}
        <div className="grid grid-cols-4 gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              data-stage={item.stage}
              data-item-id={item.id}
              className="relative aspect-square overflow-hidden rounded-lg bg-white"
            >
              <UploadPreviewImage
                src={item.previewUrl}
                className="h-full w-full object-contain opacity-80"
              />
              {item.stage === "ready" && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
                  <div className="rounded-full bg-green-500 p-1 text-white shadow-sm">
                    <Sparkles className="h-3 w-3" />
                  </div>
                </div>
              )}
              {item.stage === "error" && (
                <button
                  type="button"
                  onClick={() => retry(item.id)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-950/60 text-white"
                  title={item.error ? `Tap to retry — ${item.error}` : "Tap to retry"}
                >
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Retry</span>
                </button>
              )}
              {(item.stage === "queued" || item.stage === "processing") && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </div>
              )}
              {item.stage === "error" && (
                <button
                  type="button"
                  onClick={(e) => {
                    // Prevent the underlying retry button from also firing.
                    e.stopPropagation();
                    dismiss(item.id);
                  }}
                  className="absolute top-1 right-1 z-10 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                  title="Remove from queue"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Error details panel — visible when any item has errored.
            Without this the user only sees a "Retry" tile with no
            indication of what actually failed, which made batch-2
            failures impossible to diagnose from the phone. */}
        {counts.error > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-medium">
                {counts.error} item{counts.error === 1 ? "" : "s"} errored
              </p>
              <button
                type="button"
                onClick={() => {
                  for (const it of items) {
                    if (it.stage === "error") retry(it.id);
                  }
                }}
                className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700"
              >
                Retry all
              </button>
            </div>
            <ul className="space-y-1">
              {items
                .filter((i) => i.stage === "error")
                .map((i) => (
                  <li key={i.id} className="break-words">
                    <span className="font-medium">{i.file.name}:</span>{" "}
                    {i.error ?? "Unknown error"}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* If every remaining item is errored, offer escape */}
        {inFlight === 0 && counts.error > 0 && counts.ready === 0 && (
          <Button
            variant="outline"
            className="mt-6"
            onClick={handleCancel}
          >
            Back to wardrobe
          </Button>
        )}
      </div>
    </div>
  );
}
