import { NextResponse } from "next/server";

/**
 * Parse a JSON object request body. A missing, malformed or non-object
 * body gets a 400 response instead of throwing (which surfaced as an
 * unhandled 500 in every CRUD route that called request.json() bare).
 *
 *   const body = await readJsonObject(request);
 *   if (isNextResponse(body)) return body;
 */
export async function readJsonObject(
  request: Request
): Promise<Record<string, unknown> | NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return body as Record<string, unknown>;
}
