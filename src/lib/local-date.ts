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
