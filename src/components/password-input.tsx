"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Password field with a built-in show/hide eye toggle. Beta feedback:
// users on mobile can't easily verify a typed-out long password without
// a peek option, especially when their autofill manager doesn't trigger.
// Mirrors the props of a regular <input> so it's a drop-in replacement
// for `<input type="password" ... />` everywhere we collect passwords.
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          // Reserve room on the right for the eye button so long inputs
          // don't run under it. Default auth inputs use shared CSS via
          // class; consumers passing className can layer on top.
          className={cn("pr-10", className)}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
