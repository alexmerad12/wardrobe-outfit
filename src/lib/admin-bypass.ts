// Cap-bypass allowlist. Reads two env vars and unions them:
//   ADMIN_EMAIL      — single admin email (also used by /admin dashboard gate)
//   CAP_BYPASS_EMAILS — comma-separated list of additional emails that
//                       skip per-user daily caps (suggest, refine, etc.)
//
// Separate from ADMIN_EMAIL because the cap-bypass list is wider than
// the dashboard-access list — e.g. the operator's spouse can be capped-
// uncapped without seeing every beta user's usage stats.
function getBypassEmails(): Set<string> {
  const out = new Set<string>();
  const admin = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (admin) out.add(admin);
  const list = process.env.CAP_BYPASS_EMAILS?.split(",") ?? [];
  for (const raw of list) {
    const email = raw.toLowerCase().trim();
    if (email) out.add(email);
  }
  return out;
}

// The email must be confirmed: otherwise anyone could sign up with an
// allowlisted address nobody has registered yet and skip the paywall and
// every cap. (Today every allowlisted address is registered, checked
// 2026-10-15, and confirmation is still off, so this is defense in depth
// that becomes load-bearing once "Confirm email" is turned on.)
export function isCapBypassed(
  email: string | null | undefined,
  emailConfirmed: boolean
): boolean {
  if (!email || !emailConfirmed) return false;
  return getBypassEmails().has(email.toLowerCase());
}
