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
import type * as Sentry from "@sentry/nextjs";

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export const SENTRY_DATA_COLLECTION: NonNullable<InitOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ["user-agent", "content-type", "accept-language", "referer"] },
    response: false,
  },
  httpBodies: [],
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};
