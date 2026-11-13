// Preloaded into `next start` (NODE_OPTIONS=--require <this file>). Every
// request the server process makes to *.sentry.io goes to the local recorder
// instead, over plain HTTP: the envelope can be read and nothing reaches the
// real Sentry project. That covers the server SDK and the /monitoring rewrite
// (the browser's envelopes). Everything else is untouched.
//
// The DSN is compiled into the build (NEXT_PUBLIC_), so pointing it somewhere
// else at start time does nothing: hence the redirect.
/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const https = require("node:https");

const RECORDER_PORT = Number(process.env.SENTRY_CAPTURE_PORT || 9911);
const isSentry = (host) => typeof host === "string" && /(^|\.)sentry\.io$/i.test(host.replace(/:\d+$/, ""));

function hostOf([first, second]) {
  if (typeof first === "string") {
    try {
      return new URL(first).hostname;
    } catch {
      return undefined;
    }
  }
  if (first instanceof URL) return first.hostname;
  if (first && typeof first === "object") return first.hostname || first.host;
  if (second && typeof second === "object") return second.hostname || second.host;
  return undefined;
}

function toRecorder([first, second, third]) {
  let options;
  let callback;
  if (typeof first === "string" || first instanceof URL) {
    const url = new URL(String(first));
    options = { method: "GET", path: url.pathname + url.search, ...(typeof second === "object" ? second : {}) };
    callback = typeof second === "function" ? second : third;
  } else {
    options = { ...first };
    callback = second;
  }
  const headers = { ...(options.headers || {}) };
  headers["x-original-host"] = String(options.hostname || options.host || "");
  delete headers.host;
  delete headers.Host;
  return [{ method: options.method || "GET", path: options.path || "/", headers, protocol: "http:", hostname: "127.0.0.1", port: RECORDER_PORT }, callback];
}

for (const name of ["request", "get"]) {
  const original = https[name];
  https[name] = function patched(...args) {
    if (!isSentry(hostOf(args))) return original.apply(this, args);
    const request = http.request(...toRecorder(args));
    if (name === "get") request.end();
    return request;
  };
}

// A fetch-based transport (the edge runtime): same redirect.
const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = function patchedFetch(input, init) {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (isSentry(url.hostname)) {
        const headers = new Headers((init && init.headers) || (typeof input === "object" && "headers" in input ? input.headers : undefined));
        headers.set("x-original-host", url.hostname);
        headers.set("x-via", "fetch");
        return originalFetch(`http://127.0.0.1:${RECORDER_PORT}${url.pathname}${url.search}`, {
          ...(init || {}),
          method: (init && init.method) || (typeof input === "object" && input.method) || "GET",
          headers,
          body: init && init.body,
        });
      }
    } catch {
      // not a URL this understands: leave the call alone
    }
    return originalFetch.call(this, input, init);
  };
}
