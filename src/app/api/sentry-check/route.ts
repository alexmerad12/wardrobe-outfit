// TEMPORARY — Sentry production smoke test, round 2 (after moving
// instrumentation files into src/ where Next.js actually loads them).
// DELETE THIS ROUTE after the check passes.
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== "linette-smoke-2026") {
    return NextResponse.json({ error: "nope" }, { status: 403 });
  }

  // getClient() returns undefined when Sentry.init never ran — that
  // was the failure mode last round, so report it explicitly.
  const initialized = !!Sentry.getClient();

  const eventId = Sentry.captureException(
    new Error("Sentry smoke test round 2 — deliberate, safe to resolve")
  );
  const flushed = await Sentry.flush(5000);

  return NextResponse.json({ ok: true, initialized, flushed, eventId });
}
