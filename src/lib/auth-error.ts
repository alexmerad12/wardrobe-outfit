// Supabase auth errors arrive as English prose ("Invalid login
// credentials", "For security purposes, you can only request this once
// every 60 seconds"). Map the common ones to dictionary keys; anything
// unrecognized falls back to a generic localized line — raw provider
// English never reaches a French UI (audit Group D).
const PATTERNS: [RegExp, string][] = [
  [/invalid login credentials/i, "auth.errInvalidCredentials"],
  [/email not confirmed/i, "auth.errEmailNotConfirmed"],
  [/already registered|already been registered/i, "auth.errAlreadyRegistered"],
  [/password should be at least|password is too short/i, "auth.errWeakPassword"],
  [/rate limit|once every|too many requests/i, "auth.errRateLimited"],
  [/invalid email|unable to validate email/i, "auth.errInvalidEmail"],
];

export function authErrorKey(message: string | undefined | null): string {
  if (message) {
    for (const [rx, key] of PATTERNS) {
      if (rx.test(message)) return key;
    }
  }
  return "auth.errGeneric";
}
