// The Sentry tunnel. Browsers post their reports to `/monitoring`
// (`tunnelRoute` in next.config.ts); because this file exists at exactly this
// path, Sentry's build config sends those requests here instead of
// rewriting them straight to Sentry. Never rename or move it: the path is
// the SDK's constant, and without the file the plain rewrite comes back and
// forwards the visitor's address again.
//
// Sentry's handler does the work (it checks the envelope is for our own
// project, limits its size and streams it on). It only ever sees a request
// with no visitor header left on it: `src/lib/sentry-tunnel.ts` says why.
import { POST as forwardToSentry } from "@sentry/nextjs/tunnel";
import { withoutVisitorHeaders } from "@/lib/sentry-tunnel";

export function POST(request: Request): Promise<Response> {
  return forwardToSentry(withoutVisitorHeaders(request));
}
