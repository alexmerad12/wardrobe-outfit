"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
  Upload as UploadIcon,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  usePendingUploads,
  type PendingItem,
} from "@/lib/pending-uploads-context";
import { UploadPreviewImage } from "@/components/upload-preview-image";
import { useLocale } from "@/lib/i18n/use-locale";

export default function BulkUploadPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { items, addFiles, retry, dismiss } = usePendingUploads();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    let ready = 0,
      processing = 0,
      queued = 0,
      error = 0;
    for (const i of items) {
      if (i.stage === "ready") ready++;
      else if (i.stage === "processing") processing++;
      else if (i.stage === "queued") queued++;
      else if (i.stage === "error") error++;
    }
    return { ready, processing, queued, error, total: items.length };
  }, [items]);

  const allDone = counts.total > 0 && counts.processing + counts.queued === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-medium">{t("bulk.title")}</h1>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[#e8b4bc] bg-[#fdf2f4]/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f4d3d9]">
            <Sparkles className="h-7 w-7 text-[#7c2d3a]" />
          </div>
          <h2 className="text-base font-medium mb-1">{t("bulk.subtitle")}</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("bulk.description")}
          </p>
          <p className="mb-6 text-xs text-muted-foreground/80">
            Up to 10 photos at a time — pick another batch when these finish.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              size="lg"
              variant="outline"
              className="gap-2"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {t("bulk.takePhoto")}
            </Button>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => libraryInputRef.current?.click()}
            >
              <UploadIcon className="h-4 w-4" />
              {t("bulk.chooseFromLibrary")}
            </Button>
          </div>
        </div>
      )}

      {/* Progress summary */}
      {items.length > 0 && (
        <div className="mb-4 rounded-xl bg-[#fdf2f4] border border-[#e8b4bc] px-4 py-3 text-sm text-[#7c2d3a]">
          <div className="flex items-center gap-2">
            {allDone ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <span className="font-medium">
              {allDone
                ? t(counts.total === 1 ? "bulk.allProcessed" : "bulk.allProcessedPlural", { count: counts.total })
                : t("bulk.readyOfTotal", {
                    ready: counts.ready,
                    total: counts.total,
                    inProgress: counts.processing + counts.queued,
                  })}
            </span>
          </div>
          {!allDone && (
            <p className="mt-1 text-xs text-[#9b4050]/80">
              {t("bulk.keepBrowsing")}
            </p>
          )}
        </div>
      )}

      {/* Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <BulkCard
              key={item.id}
              item={item}
              onRetry={() => retry(item.id)}
              onDismiss={() => dismiss(item.id)}
            />
          ))}

          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex flex-col items-center justify-center text-muted-foreground hover:border-[#c98695] hover:bg-[#fdf2f4] transition-colors"
          >
            <Plus className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">{t("bulk.addMore")}</span>
          </button>
        </div>
      )}

      {/* Hidden inputs — shared between empty state + add-more tile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            const result = addFiles(e.target.files);
            if (result.rejected > 0) {
              alert(
                `Only 10 items process at a time. ${result.rejected} photo${result.rejected === 1 ? "" : "s"} not added — wait for the current batch to finish, then pick again.`
              );
            }
          }
          if (cameraInputRef.current) cameraInputRef.current.value = "";
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            const result = addFiles(e.target.files);
            if (result.rejected > 0) {
              alert(
                `Only 10 items process at a time. ${result.rejected} photo${result.rejected === 1 ? "" : "s"} not added — wait for the current batch to finish, then pick again.`
              );
            }
          }
          if (libraryInputRef.current) libraryInputRef.current.value = "";
        }}
      />

      {/* Bottom actions when all done */}
      {allDone && (
        <div className="fixed bottom-20 inset-x-4 sm:static sm:mt-6">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push("/wardrobe")}
          >
            {t("bulk.goToWardrobe")}
          </Button>
        </div>
      )}
    </div>
  );
}

function BulkCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingItem;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const content = (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
      <UploadPreviewImage
        src={item.previewUrl}
        alt={item.name ?? t("bulk.altClothingItem")}
        className="h-full w-full object-cover"
      />

      {(item.stage === "queued" || item.stage === "processing") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[11px] font-medium">
            {item.stage === "processing" ? t("bulk.working") : t("bulk.queued")}
          </span>
        </div>
      )}
      {item.stage === "ready" && (
        <div className="absolute top-2 right-2 rounded-full bg-green-500 p-1 text-white shadow-sm">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
      )}
      {item.stage === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-950/60 text-white"
          title={item.error}
        >
          <AlertCircle className="h-5 w-5" />
          <span className="text-[11px] font-medium">{t("bulk.failedTapToRetry")}</span>
        </div>
      )}

      {item.stage === "ready" && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
          <p className="truncate text-xs font-medium">{item.name}</p>
          {item.category && (
            <p className="truncate text-[10px] opacity-80 capitalize">{item.category}</p>
          )}
        </div>
      )}
    </div>
  );

  if (item.stage === "ready" && item.savedItemId) {
    return (
      <Link href={`/wardrobe/${item.savedItemId}?edit=1`} className="block">
        {content}
      </Link>
    );
  }
  if (item.stage === "error") {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (e.shiftKey) onDismiss();
          else onRetry();
        }}
        className="block w-full text-left"
      >
        {content}
      </button>
    );
  }
  return content;
}
