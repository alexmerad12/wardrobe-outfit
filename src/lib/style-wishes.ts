// What a person types for Style Me ("first date, someone I've never met, I
// want to make a good impression") reaches the prompt as STYLE DIRECTION.
// Until 2026-11-16 the box had no limit and the server passed any length
// on: a pasted essay would have inflated the prompt and its cost. The box
// holds 300 characters (its maxLength) and the server enforces the same.

export const STYLE_WISH_MAX_CHARS = 300;
const MAX_WISHES = 12;

export function cleanStyleWishes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const text = value.replace(/\s+/g, " ").trim().slice(0, STYLE_WISH_MAX_CHARS).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_WISHES) break;
  }
  return out;
}
