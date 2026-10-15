// Read a user's own uploaded photo back from Supabase Storage.
//
// The analyze and normalize endpoints used to fetch() whatever sourceUrl
// the client sent: any host (server-side request forgery) and any size.
// Now they resolve the request to a storage path inside the caller's own
// folder and read it through the storage API, with a size ceiling.
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "clothing-images";
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

/**
 * The storage path to read, or null when the request points anywhere but
 * the caller's own folder. Accepts `sourcePath` (current clients) or the
 * public `sourceUrl` of this project's bucket (older clients).
 */
export function ownedPhotoPath(
  userId: string,
  input: { sourcePath?: unknown; sourceUrl?: unknown }
): string | null {
  let path: string | null = null;
  if (typeof input.sourcePath === "string") {
    path = input.sourcePath;
  } else if (typeof input.sourceUrl === "string") {
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${PHOTO_BUCKET}/`;
    if (prefix.startsWith("https://") && input.sourceUrl.startsWith(prefix)) {
      try {
        path = decodeURIComponent(input.sourceUrl.slice(prefix.length).split("?")[0]);
      } catch {
        return null;
      }
    }
  }
  if (!path || !path.startsWith(`${userId}/`) || path.includes("..")) return null;
  return path;
}

export async function downloadOwnedPhoto(
  supabase: SupabaseClient,
  path: string
): Promise<{ buffer: Buffer } | { error: string; status: number }> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return { error: "Couldn't read the uploaded photo", status: 404 };
  if (data.size > MAX_PHOTO_BYTES) return { error: "Photo too large", status: 413 };
  return { buffer: Buffer.from(await data.arrayBuffer()) };
}
