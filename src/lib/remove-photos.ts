// Removes photo files nothing needs any more: the old photo after "Change
// photo", a deleted piece's photo, an upload a screen won't save. Only the
// caller's own files, and only those none of their pieces points at right
// now: the pieces are read here, just before the delete, and compared by
// exact path (photosSafeToRemove), never by a suffix match.
//
// Best effort: a failure is logged and reported, never thrown, so it can't
// undo the change that made the file unused. The log carries no path (paths
// hold the account id, and console text reaches Sentry as breadcrumbs).
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, photosSafeToRemove } from "@/lib/item-photos";
import { selectAll } from "@/lib/select-all";

type PhotoRow = { image_url: string | null; thumbnail_url: string | null };

export async function removeUnusedPhotos(
  supabase: SupabaseClient,
  userId: string,
  paths: string[]
): Promise<{ removed: number; error?: "pieces" | "storage" }> {
  if (paths.length === 0) return { removed: 0 };

  let pieces: PhotoRow[];
  try {
    pieces = await selectAll<PhotoRow>((from, to) =>
      supabase
        .from("clothing_items")
        .select("image_url, thumbnail_url")
        .eq("user_id", userId)
        .order("id")
        .range(from, to)
    );
  } catch (err) {
    console.warn("[photos] couldn't read the pieces, nothing removed:", err instanceof Error ? err.message : err);
    return { removed: 0, error: "pieces" };
  }

  const safe = photosSafeToRemove(userId, paths, pieces);
  if (safe.length === 0) return { removed: 0 };

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).remove(safe);
  if (error) {
    console.warn("[photos] storage cleanup failed:", error.message);
    return { removed: 0, error: "storage" };
  }
  return { removed: data?.length ?? 0 };
}
