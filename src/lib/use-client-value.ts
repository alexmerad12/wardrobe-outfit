"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * Read a browser-only value (localStorage, sessionStorage, matchMedia, the
 * PWA display mode) during render instead of copying it into state from a
 * mount effect. Server render and hydration see `serverValue`; React then
 * re-renders once with `read()` on the client, the same visible behavior
 * as the old effect without the cascading render React 19 flags
 * (react-hooks/set-state-in-effect).
 *
 * `read` must not throw and must return a primitive or a stable reference.
 * The value is read, not watched: pair it with local state for values the
 * page itself changes (see outfits / wardrobe dismiss flags).
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, read, () => serverValue);
}
