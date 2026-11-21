// Which recorded requests are a BROWSER's envelope, delivered through the
// app's tunnel, and which are the server SDK's own? The server SDK names
// itself in the user agent ("sentry.javascript.nextjs/11.x"); whatever the
// tunnel uses to deliver (the browser's own agent through a rewrite, Node's
// through the route handler) does not.
export const isFromBrowser = (headers) => !/^sentry\.javascript/i.test(String(headers?.["user-agent"] ?? ""));

// Headers that tell Sentry who the visitor is. None may be on a delivery.
export const VISITOR_HEADERS = ["cookie", "x-forwarded-for", "x-sentry-forwarded-for", "x-vercel-forwarded-for", "x-real-ip", "cf-connecting-ip", "forwarded", "referer"];
