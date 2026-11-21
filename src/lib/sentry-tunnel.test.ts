import { describe, expect, it } from "vitest";
import { withoutVisitorHeaders } from "./sentry-tunnel";

describe("withoutVisitorHeaders", () => {
  const envelope = '{"dsn":"https://public@o1.ingest.us.sentry.io/2"}\n{"type":"session"}\n{}';
  const incoming = () =>
    new Request("https://linette.app/monitoring", {
      method: "POST",
      body: envelope,
      headers: {
        "content-length": String(envelope.length),
        "content-type": "text/plain;charset=UTF-8",
        cookie: "sb-auth-token=secret",
        referer: "https://linette.app/wardrobe?category=tops",
        origin: "https://linette.app",
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "203.0.113.77",
        "x-vercel-forwarded-for": "203.0.113.77",
        "x-real-ip": "203.0.113.78",
        "cf-connecting-ip": "203.0.113.79",
        forwarded: "for=203.0.113.77",
      },
    });

  it("keeps the length and nothing else", () => {
    const sent = withoutVisitorHeaders(incoming());
    expect([...sent.headers.keys()]).toEqual(["content-length"]);
    expect(sent.headers.get("content-length")).toBe(String(envelope.length));
  });

  it("passes the envelope through unchanged", async () => {
    expect(await withoutVisitorHeaders(incoming()).text()).toBe(envelope);
  });

  it("does not carry the page's own address", () => {
    expect(withoutVisitorHeaders(incoming()).url).toBe("http://localhost/");
  });
});
