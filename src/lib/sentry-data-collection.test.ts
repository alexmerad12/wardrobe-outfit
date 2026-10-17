import { describe, expect, it } from "vitest";
import { SENTRY_DATA_COLLECTION } from "./sentry-data-collection";

// @sentry/nextjs 11 collects cookies, user info / IP, bodies, AI prompts and
// stack-frame variables unless told otherwise. This baseline must keep them off.
describe("SENTRY_DATA_COLLECTION", () => {
  it("never sends cookies (the Supabase session token), user info or IPs", () => {
    expect(SENTRY_DATA_COLLECTION.cookies).toBe(false);
    expect(SENTRY_DATA_COLLECTION.userInfo).toBe(false);
  });

  it("never sends request or response bodies, AI prompts, query data or local variables", () => {
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([]);
    expect(SENTRY_DATA_COLLECTION.genAI).toEqual({ inputs: false, outputs: false });
    expect(SENTRY_DATA_COLLECTION.databaseQueryData).toBe(false);
    expect(SENTRY_DATA_COLLECTION.queues).toBe(false);
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
  });

  it("allows only debugging headers on requests, none on responses", () => {
    const headers = SENTRY_DATA_COLLECTION.httpHeaders as { request: { allow: string[] }; response: boolean };
    expect(headers.response).toBe(false);
    expect(headers.request.allow).not.toContain("cookie");
    expect(headers.request.allow).not.toContain("authorization");
    expect(headers.request.allow.some((h) => h.startsWith("x-vercel-ip"))).toBe(false);
  });
});
