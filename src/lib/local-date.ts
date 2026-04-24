// Returns the user's local date in YYYY-MM-DD format. Used when talking
// to /api/today so the server can compare against the actual day the user
// is living in, not the server's UTC day — otherwise western-timezone
// users see yesterday's outfit lingering until UTC midnight rolls over.
export function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Returns the UTC timestamp (ms) of "the most recent 2am in the user's
// local timezone". Used as the stale cutoff on /api/today — any outfit
// whose updated_at is before this is considered "from yesterday" even if
// the date strings happen to match (e.g. user wore something at 1am).
// 2am instead of strict midnight gives night owls a small grace window.
export function getStaleBeforeTimestamp(): number {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(2, 0, 0, 0);
  // If it's currently before 2am, the cutoff should be YESTERDAY'S 2am
  // — anything after that still counts as "today" in the user's head.
  if (now.getTime() < cutoff.getTime()) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff.getTime();
}
