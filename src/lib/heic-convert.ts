// Browser-side HEIC/HEIF → JPEG conversion. Samsung phones with the
// "High Efficiency" camera setting produce HEIC files that Chrome's
// canvas / createImageBitmap can't decode. Without this, those photos
// silently fall through every step (downscale, bg-removal, flatten)
// and end up uploaded as their original HEIC bytes, which the
// browser's <img> tag also can't render. Result: broken/icon-image
// previews and saved items the user can't see.
//
// heic2any is the only library that works in the browser without a
// WASM blob; it ships its own libheif build internally. ~250 KB
// minified, lazy-imported below so it's only fetched when actually
// needed.

const HEIC_MIME_PATTERN = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_EXT_PATTERN = /\.hei[cf]$/i;

export function isHeicFile(file: File | Blob): boolean {
  if (HEIC_MIME_PATTERN.test(file.type)) return true;
  // Some pickers strip the MIME type; fall back to the filename.
  if (file instanceof File && HEIC_EXT_PATTERN.test(file.name)) return true;
  return false;
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  // Lazy import so non-HEIC uploads don't pay the bundle cost.
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.85,
  });
  // heic2any returns Blob | Blob[] (one blob per frame for animated HEIC).
  // For our use-case (still photos) we only ever want the first frame.
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(HEIC_EXT_PATTERN, "") + ".jpg";
  return new File([jpegBlob], newName, { type: "image/jpeg" });
}
