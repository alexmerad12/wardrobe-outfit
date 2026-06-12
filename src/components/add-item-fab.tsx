"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Camera, ImageIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_BATCH,
  usePendingUploads,
} from "@/lib/pending-uploads-context";
import { useLocale } from "@/lib/i18n/use-locale";
import { cn } from "@/lib/utils";

// Global floating "Add piece" button. Lives above the bottom-nav so
// every screen has the same one-tap entry to the camera + library
// picker — matches what Whering / Cladwell do (one canonical "+" the
// user learns once and reuses forever, instead of a scatter of CTAs
// across each tab's empty state). Reuses the same pending-uploads
// pipeline as the wardrobe-page Add button, so behaviour stays
// identical wherever the user triggers it.
//
// Hidden on auth + onboarding (the user can't have a wardrobe yet)
// and on the add/bulk/item-detail screens themselves (would be a
// redundant button on top of the dedicated upload UI).
export function AddItemFab() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { addFiles } = usePendingUploads();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // FAB is contextual to wardrobe management — adding items only
  // makes sense from /wardrobe (the listing). On Home / Suggest /
  // Favorites / Profile the user is consuming outfits, not curating,
  // so a floating "+" there is noise. The Wardrobe tab is one tap
  // away on the bottom nav from any screen.
  //
  // Also hidden on the wardrobe sub-routes (/wardrobe/add, /bulk,
  // /[id]) — those already have their own upload UI and a floating
  // duplicate would just compete with it.
  if (pathname !== "/wardrobe") {
    return null;
  }

  function handlePickedFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const result = addFiles(files);
    if (result.rejected > 0) {
      alert(
        `Only ${MAX_BATCH} items at a time. ${result.rejected} photo${result.rejected === 1 ? "" : "s"} not added — finish this batch, then pick another.`
      );
    }
    if (result.accepted > 0) {
      router.push("/wardrobe/bulk");
    }
    e.target.value = "";
  }

  return (
    <>
      <div
        className={cn(
          // Anchored above the bottom-nav (h-16 = 64px) with breathing
          // room so the FAB clears the safe area on devices with home
          // indicators. z-50 matches the nav so they share the same
          // layer; the FAB renders later in the tree so it lands on top.
          "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={t("wardrobe.add")}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-foreground/20 transition-transform active:scale-95"
              >
                <Plus className="h-6 w-6" />
              </button>
            }
          />
          <DropdownMenuContent align="end" side="top" className="w-72">
            <DropdownMenuItem
              onClick={() => cameraInputRef.current?.click()}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              {t("wardrobe.takePhoto")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => libraryInputRef.current?.click()}
              className="gap-2"
            >
              <ImageIcon className="h-4 w-4" />
              {t("wardrobe.chooseFromLibrary")}
            </DropdownMenuItem>
            <div className="border-t mt-1 pt-2 px-2 pb-2 text-[11px] leading-relaxed">
              <p className="editorial-label mb-1.5">Photo tips</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• One item per photo, fully visible</li>
                <li>• Flat surface for tops, pants, knits — bed, table, floor</li>
                <li>• Hanger for coats, blazers, dresses, long skirts</li>
                <li>• Good light, no strong shadows</li>
                <li>• Up to 10 photos at a time</li>
              </ul>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Hidden file inputs — same pattern as the wardrobe-page add
          button: camera capture for the take-photo path, multiple for
          library. handlePickedFiles routes to /wardrobe/bulk once the
          pending-uploads context has accepted the files. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePickedFiles}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePickedFiles}
      />
    </>
  );
}
