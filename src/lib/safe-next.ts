// The post-login "next" target arrives via query string, so it is
// attacker-controlled (emailed login links). Restrict it to same-origin
// path navigations: "https://evil.com", "//evil.com" (protocol-relative)
// and "/\evil.com" (backslash tricks) must all fall back to home.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
