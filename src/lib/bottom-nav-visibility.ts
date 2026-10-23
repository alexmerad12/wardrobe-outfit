import { useSyncExternalStore } from "react";

// A screen with its own close / save bar (the full-screen item edit form)
// hides the bottom nav while it is open: one tap on the nav left the form
// mid-edit, and it covered the form's last fields (design review,
// 2026-10-23). A count, so overlapping callers can't unhide it early.

let holds = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isBottomNavHidden(): boolean {
  return holds > 0;
}

/** Hides the bottom nav until the returned function is called (use it as an
 *  effect's cleanup). Calling the release twice has no extra effect. */
export function hideBottomNav(): () => void {
  holds++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    emit();
  };
}

export function useBottomNavHidden(): boolean {
  return useSyncExternalStore(subscribe, isBottomNavHidden, () => false);
}
