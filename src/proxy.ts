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
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
