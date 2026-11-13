import { describe, expect, it } from "vitest";
import { SENTRY_DATA_COLLECTION, sentryBeforeSendSpan } from "./sentry-data-collection";

// @sentry/nextjs 11 collects cookies, user info / IP, bodies, AI prompts and
// stack-frame variables unless told otherwise. This baseline must keep them off.
describe("SENTRY_DATA_COLLECTION", () => {
  it("never sends cookies (the Supabase session token), user info or IPs", () => {
    expect(SENTRY_DATA_COLLECTION.cookies).toBe(false);
    expect(SENTRY_DATA_COLLECTION.userInfo).toBe(false);
  });

  it("never sends request or response bodies, query strings, AI prompts, query data or local variables", () => {
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([]);
    expect(SENTRY_DATA_COLLECTION.urlQueryParams).toBe(false);
    expect(SENTRY_DATA_COLLECTION.genAI).toEqual({ inputs: false, outputs: false });
    expect(SENTRY_DATA_COLLECTION.mcp).toEqual({ inputs: false, outputs: false });
    expect(SENTRY_DATA_COLLECTION.databaseQueryData).toBe(false);
    expect(SENTRY_DATA_COLLECTION.queues).toBe(false);
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
  });

  it("allows only debugging headers on requests, none on responses", () => {
    const headers = SENTRY_DATA_COLLECTION.httpHeaders as { request: { allow: string[] }; response: boolean };
    expect(headers.response).toBe(false);
    expect(headers.request.allow).not.toContain("cookie");
    expect(headers.request.allow).not.toContain("authorization");
    // The referer is the page's address, query string included.
    expect(headers.request.allow).not.toContain("referer");
    expect(headers.request.allow.some((h) => h.startsWith("x-vercel-ip"))).toBe(false);
  });
});

describe("sentryBeforeSendSpan", () => {
  type Span = Parameters<typeof sentryBeforeSendSpan>[0];
  const span = (attributes: Record<string, unknown>) =>
    ({ trace_id: "t", span_id: "s", name: "GET /api/today", start_timestamp: 0, status: "ok", is_segment: true, attributes }) as Span;

  it("cuts the query string Next writes into http.target", () => {
    const sent = sentryBeforeSendSpan(span({ "http.target": "/api/weather?lat=45.5&lng=-73.6", "http.route": "/api/weather" }));
    expect(sent.attributes["http.target"]).toBe("/api/weather");
    expect(sent.attributes["http.route"]).toBe("/api/weather");
  });

  it("leaves a path without a query, and spans without the attribute, alone", () => {
    expect(sentryBeforeSendSpan(span({ "http.target": "/wardrobe" })).attributes["http.target"]).toBe("/wardrobe");
    expect(sentryBeforeSendSpan(span({ "sentry.op": "db" })).attributes).toEqual({ "sentry.op": "db" });
  });
});
