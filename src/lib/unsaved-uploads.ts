// The photos one screen uploaded and hasn't saved. Every pick uploads a new
// file and the server cuts it out in place, so a photo the person replaces,
// or leaves behind when the screen goes away, used to stay in storage for good
// (2026-11-17 audit: 817 such files). Now it is removed.
//
// Removal waits for that photo's pipeline to settle: /api/items/normalize
// writes the cutout over the upload, so removing the file while it runs would
// let the cutout land again afterwards. A photo being saved is kept until the
// save answers, and for good once it went through.
export type UploadTracker = {
  /** A new photo's upload + cutout started: resolves to its bucket path, or null when nothing landed. */
  track(upload: Promise<string | null>): void;
  /** The screen is saving the piece with this photo; `saved` answers whether it went through. */
  saving(path: string, saved: Promise<boolean>): void;
  /** The screen is going away, or its editor was closed: let go of the current photo. */
  abandonCurrent(): void;
};

export function createUploadTracker(remove: (path: string) => void | Promise<void>): UploadTracker {
  let current: Promise<string | null> | null = null;
  const saves = new Map<string, Promise<boolean>>();
  const removed = new Set<string>();

  const letGo = (upload: Promise<string | null>) => {
    void upload
      .then(async (path) => {
        if (!path || removed.has(path)) return;
        const save = saves.get(path);
        if (save && (await save)) return;
        if (removed.has(path)) return;
        removed.add(path);
        await remove(path);
      })
      .catch(() => undefined);
  };

  return {
    track(upload) {
      if (current) letGo(current);
      current = upload.then(
        (path) => path,
        () => null
      );
    },
    saving(path, saved) {
      saves.set(
        path,
        saved.then(
          (ok) => ok,
          () => false
        )
      );
    },
    abandonCurrent() {
      if (current) letGo(current);
      current = null;
    },
  };
}
