import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js must stay out of the auth gate: a redirect response makes the
    // browser refuse to register the service worker (breaks PWA install
    // for signed-out and mid-onboarding visitors).
    // robots.txt, sitemap.xml and /.well-known (Android app links) are for
    // crawlers and the operating system: a redirect to /login answers them
    // with a sign-in page.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|robots.txt|sitemap.xml|\\.well-known|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
