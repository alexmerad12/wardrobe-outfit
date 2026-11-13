// What Sentry may collect, shared by the server, edge and browser inits.
//
// @sentry/nextjs 11 replaced `sendDefaultPii` with `dataCollection`, and
// left unset it collects far more than v10 did: cookies, user info and IP
// addresses, request and response bodies, generative-AI prompts and
// outputs, database query data and local variables in stack frames. Here
// the cookies carry the Supabase session token, and the bodies and prompts
// carry people's wardrobes, photos and profiles. This keeps the v10-era
// privacy level the privacy page describes: errors and their stack traces
// only, with the request headers that help debugging.
//
// Measured, not assumed: on 2026-11-13 the envelopes of a local production
// build were recorded on 11.6.0 and on 11.12.0 (browser error, server error,
// a real and a failing Gemini call) and searched for the session, the
// account's email, planted cookies, headers, IPs, a request body and the
// prompt. After any @sentry upgrade, read the release notes for new
// `dataCollection` keys (they default to ON) and repeat that check.
import type * as Sentry from "@sentry/nextjs";

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export const SENTRY_DATA_COLLECTION: NonNullable<InitOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    // No `referer`: its value is the page's address, query string included.
    request: { allow: ["user-agent", "content-type", "accept-language"] },
    response: false,
  },
  httpBodies: [],
  // Query strings ride on every traced URL: the weather call's position
  // (rounded), Supabase filters with the account's id, a page's own
  // parameters. On by default.
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  // Added in 11.9.0, on by default, and resolved on its own (not from genAI).
  // The app runs no MCP server, so this is the baseline staying explicit.
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

// `urlQueryParams` covers the URLs Sentry builds. Next's own tracing also
// writes the request's path AND query into `http.target` on every server
// request span, and nothing in `dataCollection` reaches that one.
export const sentryBeforeSendSpan: NonNullable<InitOptions["beforeSendSpan"]> = (span) => {
  const target = span.attributes["http.target"];
  if (typeof target === "string") {
    const query = target.indexOf("?");
    if (query !== -1) span.attributes["http.target"] = target.slice(0, query);
  }
  return span;
};
