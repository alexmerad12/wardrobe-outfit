// One-shot Sentry onboarding-verifier page.
//
// The Sentry "Verify" wizard step polls for a specific test-event
// signature before it'll mark the project as set-up. The wizard
// normally generates this page itself; we set up manually, so it
// doesn't exist. Visiting this page and clicking the button fires
// the exact error pattern Sentry watches for. After the wizard
// flips to "complete", this route can be deleted.
"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function SentryExamplePage() {
  const [errorState, setErrorState] = useState<string | null>(null);

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Sentry verification</h1>
      <p style={{ marginBottom: 20, color: "#555" }}>
        Click the button below to send a test error + span to Sentry. After
        the wizard&apos;s &quot;Verify&quot; step flips green, you can remove this page from
        the codebase.
      </p>
      <button
        type="button"
        onClick={async () => {
          setErrorState("sending...");
          try {
            await Sentry.startSpan(
              { name: "Example Frontend Span", op: "test" },
              async () => {
                const res = await fetch("/api/sentry-example-api");
                if (!res.ok) {
                  throw new Error("Sentry Example Frontend Error");
                }
              }
            );
          } catch (e) {
            setErrorState(`thrown: ${(e as Error).message}`);
            throw e;
          }
        }}
        style={{
          padding: "12px 24px",
          background: "#000",
          color: "#fff",
          border: 0,
          borderRadius: 8,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Throw test error
      </button>
      {errorState && (
        <p style={{ marginTop: 16, color: "#888", fontSize: 13 }}>
          State: {errorState}
        </p>
      )}
    </div>
  );
}
