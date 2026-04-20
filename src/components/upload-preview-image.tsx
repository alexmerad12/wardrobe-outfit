"use client";

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Preview thumbnail for an in-flight upload. The source is a blob: URL
// created from whatever the user picked. If the browser can't decode the
// format (HEIC on desktop, RAW, AVIF on older engines, corrupt files),
// onError fires and we swap in a tasteful placeholder instead of the
// stock "broken image" glyph — which looked unprofessional next to the
// rest of the app.
export function UploadPreviewImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  // Reset the error state if the source URL changes (the pending pipeline
  // swaps in a downscaled JPEG once that's ready, which often resolves the
  // initial decode failure).
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (errored || !src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-[#fdf2f4] to-[#f4d3d9]",
          className
        )}
      >
        <ImageIcon className="h-6 w-6 text-[#9b4050]/40" />
      </div>
    );
  }

  // Native <img> is intentional here — these are local blob: URLs, not
  // remote URLs that would benefit from next/image optimisation.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
