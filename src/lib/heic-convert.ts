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

// HEIF/HEIC brand codes that appear at byte offset 8-11 (after the
// "ftyp" magic at offset 4). Covers Samsung "High Efficiency",
// iPhone defaults, and burst/sequence variants.
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
  "heip",
]);

// Sync check by MIME type / file extension. Fast path for files where
// the picker preserved the type (most modern browsers).
export function isHeicFile(file: File | Blob): boolean {
  if (HEIC_MIME_PATTERN.test(file.type)) return true;
  if (file instanceof File && HEIC_EXT_PATTERN.test(file.name)) return true;
  return false;
}

// Magic-byte check. Some Samsung/Android share-sheet pickers strip the
// MIME type AND fudge the filename to .jpg even though the bytes are
// HEIC. The only reliable detector is the ISOBMFF "ftyp" box at byte
// offset 4 + the brand code at offset 8.
export async function isHeicFileDeep(file: File | Blob): Promise<boolean> {
  if (isHeicFile(file)) return true;
  try {
    const head = await file.slice(0, 16).arrayBuffer();
    const v = new Uint8Array(head);
    // "ftyp" at bytes 4-7
    if (v[4] !== 0x66 || v[5] !== 0x74 || v[6] !== 0x79 || v[7] !== 0x70) {
      return false;
    }
    const brand = String.fromCharCode(v[8], v[9], v[10], v[11]);
    return HEIF_BRANDS.has(brand);
  } catch {
    return false;
  }
}

export async function convertHeicToJpeg(file: File): Promise<File> {
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
