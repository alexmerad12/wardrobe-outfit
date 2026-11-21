// What the Sentry tunnel is allowed to pass on about the visitor: nothing.
//
// A browser's error report reaches Sentry through our own address
// (`tunnelRoute` in next.config.ts). Sentry never stores the visitor's IP
// (`userInfo: false`), but it works out a CITY from the address of whoever
// delivers the report, and shows it on the error ("Geography: Montreal").
// Two ways of delivering hand it the visitor's address:
//   - the plain rewrite forwards every request header, `x-forwarded-for`
//     included (what ran until 2026-11-21);
//   - Sentry's own route handler (`@sentry/nextjs/tunnel`) drops the cookies
//     but copies the address into `X-Sentry-Forwarded-For` on purpose, with
//     the referer (the page's address, query string included).
// So the route gives that handler a request that has the envelope and its
// length, and no header it could copy. Sentry then sees our server's
// address, as it does for the server's own reports.
export function withoutVisitorHeaders(request: Request): Request {
  const headers = new Headers();
  // The handler refuses a request without a length (411).
  const length = request.headers.get("content-length");
  if (length) headers.set("content-length", length);
  return new Request("http://localhost/", {
    method: "POST",
    headers,
    body: request.body,
    // A streamed body needs this in Node; the DOM types don't know it yet.
    duplex: "half",
  } as RequestInit);
}
