import { NextResponse } from "next/server";

// PostgREST / Postgres error codes caused by the request's own data rather
// than by the server: an unknown column (PGRST204), a malformed value such
// as a non-uuid id or a garbage date (22P02, 22007, 22008), a number out of
// range (22003), a missing required field (23502), a failed check
// constraint (23514) or a reference to a row that doesn't exist (23503).
// These answer 400, so a bad payload reads as the caller's mistake instead
// of a server crash in the logs.
const CLIENT_ERROR_CODES = new Set([
  "PGRST204",
  "22P02",
  "22007",
  "22008",
  "22003",
  "23502",
  "23514",
  "23503",
]);

export function dbErrorResponse(error: { code?: string; message: string }): NextResponse {
  const status = error.code && CLIENT_ERROR_CODES.has(error.code) ? 400 : 500;
  return NextResponse.json({ error: error.message }, { status });
}
