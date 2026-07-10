// TEMPORARY — Sentry production smoke test. Captures one deliberate
// exception and returns the Sentry event ID so we can confirm
// ingestion end-to-end. DELETE THIS ROUTE after the check passes.
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== "linette-smoke-2026") {
    return NextResponse.json({ error: "nope" }, { status: 403 });
  }

  const eventId = Sentry.captureException(
    new Error("Sentry smoke test — deliberate, safe to resolve")
  );
  await Sentry.flush(5000);

  return NextResponse.json({ ok: true, eventId });
}
