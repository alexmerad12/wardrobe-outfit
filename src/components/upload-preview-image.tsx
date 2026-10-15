"use client";

import { useState } from "react";
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
  // Remember WHICH source failed: when the pending pipeline swaps in a
  // new URL (converted JPEG, then the cut-out photo), the error no longer
  // applies, with no reset effect needed.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted",
          className
        )}
      >
        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
      </div>
    );
  }

  // Native <img> is intentional here — these are local blob: URLs, not
  // remote URLs that would benefit from next/image optimisation.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
