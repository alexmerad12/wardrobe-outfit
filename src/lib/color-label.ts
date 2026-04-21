/**
 * Normalize a color name into the Title Case form used as the i18n
 * translation key. Color names come from three sources with mixed casing:
 *   - color-engine.ts buckets ("Black", "Sky Blue") — already correct
 *   - fashion-colors.ts swatches ("Salmon", "Antique White") — correct
 *   - AI auto-fill ("black", "navy blue", "DARK BROWN") — anything goes
 *
 * Lower-casing the whole string then capitalizing each word gives a
 * stable key like "Black", "Navy Blue", "Dark Brown" so t(`color.X`)
 * resolves regardless of how the value was originally stored.
 */
export function toColorKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
