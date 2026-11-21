// Where a piece's photo lives in the photo bucket, and which files a change
// leaves behind. Pure, so the item routes, the upload route and the screens
// share one reading of a photo URL: the 2026-11-09 storage audit matched URLs
// by suffix and missed every photo whose URL ends in normalize's `?v=`
// cache-buster (`known-root-causes.md`).

export const PHOTO_BUCKET = "clothing-images";

const PUBLIC_MARKER = `/storage/v1/object/public/${PHOTO_BUCKET}/`;

type PhotoColumns = { image_url?: string | null; thumbnail_url?: string | null };

/**
 * The bucket path a photo URL points at, or null when the URL isn't one of
 * this bucket's public URLs. Drops the query (normalize's `?v=`) and any
 * fragment, and decodes the name.
 */
export function photoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const at = url.indexOf(PUBLIC_MARKER);
  if (at === -1) return null;
  const raw = url.slice(at + PUBLIC_MARKER.length).split(/[?#]/)[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** True for a file directly in the user's own folder: `<userId>/<name>`. */
export function isOwnPhotoPath(userId: string, path: string): boolean {
  if (!userId || path.includes("..")) return false;
  const prefix = `${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return name.length > 0 && !name.includes("/");
}

function photoPaths(row: PhotoColumns | null | undefined): string[] {
  return [photoPathFromUrl(row?.image_url), photoPathFromUrl(row?.thumbnail_url)].filter(
    (p): p is string => !!p
  );
}

/** The user's own files a piece pointed at before an update and no longer points at after it. */
export function photosLeftBehind(
  userId: string,
  before: PhotoColumns | null | undefined,
  after: PhotoColumns | null | undefined
): string[] {
  const kept = new Set(photoPaths(after));
  return [...new Set(photoPaths(before))].filter((p) => !kept.has(p) && isOwnPhotoPath(userId, p));
}

/** The candidates that sit in the user's own folder and that none of `pieces` points at. */
export function photosSafeToRemove(userId: string, candidates: string[], pieces: PhotoColumns[]): string[] {
  const used = new Set(pieces.flatMap(photoPaths));
  return [...new Set(candidates)].filter((p) => isOwnPhotoPath(userId, p) && !used.has(p));
}

/**
 * Where a new upload goes: the user's folder, the upload time, then the file
 * name with anything unsafe replaced. Runs of dots collapse to one: a path
 * with ".." fails the folder check (and normalize refused it too).
 */
export function newUploadPath(userId: string, fileName: string, now: number): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".") || "item.jpg";
  return `${userId}/${now}-${safe}`;
}
