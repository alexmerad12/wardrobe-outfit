"use client";

import { useEffect, useState } from "react";

// Tracks the user's scroll direction so headers / tab strips can hide
// when scrolling DOWN (out of the way of content) and reappear when
// scrolling UP (so the user can change context without scrolling all
// the way back to the top). iOS Safari URL bar pattern.
//
// `threshold` ignores tiny jitter near the top of the page so the
// header doesn't flicker when bouncing on scroll-rest.
export function useScrollDirection(threshold = 8): "up" | "down" {
  const [direction, setDirection] = useState<"up" | "down">("up");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      const delta = y - lastY;
      // Always reveal at the very top of the page so users never lose
      // the header just because they scrolled up a hair past 0.
      if (y < threshold) {
        setDirection("up");
      } else if (Math.abs(delta) > threshold) {
        setDirection(delta > 0 ? "down" : "up");
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return direction;
}
