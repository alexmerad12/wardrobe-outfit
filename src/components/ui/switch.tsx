"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

// Editorial toggle — quiet black/ivory track that matches the rest of
// the Settings card chrome. Base UI handles the headless accessibility
// (keyboard, aria), we just dress the parts.

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        // 44 px tall to a finger: the invisible ::after takes the taps
        // 10 px above and below the track (design review, 2026-10-24).
        "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5",
        "border border-input transition-colors",
        "data-[checked]:bg-foreground data-[checked]:border-foreground",
        "data-[unchecked]:bg-muted",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm",
          "transition-transform",
          "data-[checked]:translate-x-5 data-[unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
