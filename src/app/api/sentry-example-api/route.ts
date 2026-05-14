// Companion to /sentry-example-page — intentionally throws so the
// onboarding wizard sees a server-side error event too. Delete after
// the wizard's Verify step is satisfied.
import { NextResponse } from "next/server";

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

export function GET() {
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page."
  );
  // Unreachable — kept to satisfy TS return type.
  return NextResponse.json({ data: "Testing Sentry Error..." });
}
