import { describe, expect, it } from "vitest";
import {
  isOwnPhotoPath,
  newUploadPath,
  photoPathFromUrl,
  photosLeftBehind,
  photosSafeToRemove,
} from "./item-photos";

const BASE = "https://example.supabase.co/storage/v1/object/public/clothing-images";
const U = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const url = (path: string, v?: number) => `${BASE}/${path}${v ? `?v=${v}` : ""}`;

describe("photoPathFromUrl", () => {
  it("reads the bucket path from a public photo URL", () => {
    expect(photoPathFromUrl(url(`${U}/1776719022508-shirt.jpg`))).toBe(`${U}/1776719022508-shirt.jpg`);
  });

  it("drops the cache-buster normalize adds (the 2026-11-09 miss)", () => {
    expect(photoPathFromUrl(url(`${U}/1776719022508-shirt.jpg`, 1794855078258))).toBe(
      `${U}/1776719022508-shirt.jpg`
    );
  });

  it("decodes an encoded name and ignores a fragment", () => {
    expect(photoPathFromUrl(`${BASE}/${U}/1-blue%20coat.jpg`)).toBe(`${U}/1-blue coat.jpg`);
    expect(photoPathFromUrl(`${BASE}/${U}/1-a.jpg#top`)).toBe(`${U}/1-a.jpg`);
  });

  it("is null for anything but this bucket's public URLs", () => {
    expect(photoPathFromUrl("https://abc.public.blob.vercel-storage.com/x.jpg")).toBeNull();
    expect(
      photoPathFromUrl(`https://example.supabase.co/storage/v1/object/public/other-bucket/${U}/1-a.jpg`)
    ).toBeNull();
    expect(photoPathFromUrl(`${BASE}/`)).toBeNull();
    expect(photoPathFromUrl("")).toBeNull();
    expect(photoPathFromUrl(null)).toBeNull();
    expect(photoPathFromUrl(undefined)).toBeNull();
  });

  it("is null for a broken escape instead of throwing", () => {
    expect(photoPathFromUrl(`${BASE}/${U}/1-%E0%A4%A.jpg`)).toBeNull();
  });
});

describe("isOwnPhotoPath", () => {
  it("accepts a file directly in the caller's folder", () => {
    expect(isOwnPhotoPath(U, `${U}/1-a.jpg`)).toBe(true);
  });

  it("refuses another account's folder, even one that starts with the same characters", () => {
    expect(isOwnPhotoPath(U, `${OTHER}/1-a.jpg`)).toBe(false);
    expect(isOwnPhotoPath("abc", "abcd/1-a.jpg")).toBe(false);
  });

  it("refuses climbing out, sub-folders and the bare folder", () => {
    expect(isOwnPhotoPath(U, `${U}/../${OTHER}/1-a.jpg`)).toBe(false);
    expect(isOwnPhotoPath(U, `${U}/sub/1-a.jpg`)).toBe(false);
    expect(isOwnPhotoPath(U, `${U}/`)).toBe(false);
    expect(isOwnPhotoPath(U, `${U}/..`)).toBe(false);
  });

  it("refuses everything without a user id", () => {
    expect(isOwnPhotoPath("", "/1-a.jpg")).toBe(false);
  });
});

describe("photosLeftBehind", () => {
  it("returns the photo a change replaced", () => {
    expect(
      photosLeftBehind(U, { image_url: url(`${U}/1-old.jpg`, 5) }, { image_url: url(`${U}/2-new.jpg`, 6) })
    ).toEqual([`${U}/1-old.jpg`]);
  });

  it("returns the old photo when the update cleared it", () => {
    expect(photosLeftBehind(U, { image_url: url(`${U}/1-a.jpg`) }, { image_url: null })).toEqual([
      `${U}/1-a.jpg`,
    ]);
  });

  it("keeps a photo whose URL only got a new cache-buster", () => {
    expect(
      photosLeftBehind(U, { image_url: url(`${U}/1-a.jpg`, 5) }, { image_url: url(`${U}/1-a.jpg`, 9) })
    ).toEqual([]);
  });

  it("returns a replaced thumbnail as well, each file once", () => {
    expect(
      photosLeftBehind(
        U,
        { image_url: url(`${U}/1-a.jpg`), thumbnail_url: url(`${U}/1-a.jpg`, 3) },
        { image_url: url(`${U}/2-b.jpg`), thumbnail_url: null }
      )
    ).toEqual([`${U}/1-a.jpg`]);
  });

  it("keeps a file the piece still uses in its other column", () => {
    expect(
      photosLeftBehind(
        U,
        { image_url: url(`${U}/1-a.jpg`), thumbnail_url: null },
        { image_url: url(`${U}/2-b.jpg`), thumbnail_url: url(`${U}/1-a.jpg`) }
      )
    ).toEqual([]);
  });

  it("never returns a file outside the caller's folder or off the bucket", () => {
    expect(photosLeftBehind(U, { image_url: url(`${OTHER}/1-a.jpg`) }, { image_url: url(`${U}/2-b.jpg`) })).toEqual(
      []
    );
    expect(
      photosLeftBehind(
        U,
        { image_url: "https://abc.public.blob.vercel-storage.com/x.jpg" },
        { image_url: url(`${U}/2-b.jpg`) }
      )
    ).toEqual([]);
  });

  it("returns nothing when the piece had no photo or the photo didn't change", () => {
    expect(photosLeftBehind(U, null, { image_url: url(`${U}/2-b.jpg`) })).toEqual([]);
    expect(photosLeftBehind(U, { image_url: url(`${U}/1-a.jpg`) }, { image_url: url(`${U}/1-a.jpg`) })).toEqual([]);
  });
});

describe("photosSafeToRemove", () => {
  it("keeps any file a piece still points at, cache-buster or not", () => {
    const pieces = [
      { image_url: url(`${U}/1-a.jpg`, 7), thumbnail_url: null },
      { image_url: url(`${U}/2-b.jpg`), thumbnail_url: url(`${U}/3-c.jpg`) },
    ];
    expect(photosSafeToRemove(U, [`${U}/1-a.jpg`, `${U}/3-c.jpg`, `${U}/4-d.jpg`], pieces)).toEqual([
      `${U}/4-d.jpg`,
    ]);
  });

  it("drops paths outside the caller's folder and repeats", () => {
    expect(photosSafeToRemove(U, [`${OTHER}/1-a.jpg`, `${U}/4-d.jpg`, `${U}/4-d.jpg`, `${U}/sub/5.jpg`], [])).toEqual([
      `${U}/4-d.jpg`,
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(photosSafeToRemove(U, [], [{ image_url: url(`${U}/1-a.jpg`), thumbnail_url: null }])).toEqual([]);
  });
});

describe("newUploadPath", () => {
  it("names an upload after its time and a safe version of the file name", () => {
    expect(newUploadPath(U, "IMG 1234.jpg", 1776719022508)).toBe(`${U}/1776719022508-IMG_1234.jpg`);
    expect(newUploadPath(U, "été.png", 5)).toBe(`${U}/5-_t_.png`);
  });

  it("falls back to item.jpg for a file with no name", () => {
    expect(newUploadPath(U, "", 5)).toBe(`${U}/5-item.jpg`);
  });

  it("collapses dot runs, which the folder check refuses (normalize did too)", () => {
    expect(newUploadPath(U, "my..photo.jpg", 5)).toBe(`${U}/5-my.photo.jpg`);
  });

  it("always gives a path the caller may later remove", () => {
    for (const name of ["a/b\\c.jpg", "...", "x..", "IMG_20260416_163510.jpg"]) {
      expect(isOwnPhotoPath(U, newUploadPath(U, name, 5)), name).toBe(true);
    }
  });
});
