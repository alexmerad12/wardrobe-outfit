// Renders a translation template containing `{brand}` with the brand
// name itself ("Linette") styled in Parisienne script — the same hand-
// script that fronts the launch monogram. Used wherever Linette
// introduces herself or acts in the first person (greeting, auth
// subtitle, onboarding welcome, install prompt, stylist loader).
//
// Surrounding text keeps the parent's font; only the brand span swaps
// to --font-script. Callsites pass `scriptClassName` to bump the
// script size when the surrounding context is large (headings) and
// can leave it unset for default size in body/small contexts.

import { cn } from "@/lib/utils";

interface BrandedNameProps {
  template: string;
  scriptClassName?: string;
  brand?: string;
}

export function BrandedName({
  template,
  scriptClassName,
  brand = "Linette",
}: BrandedNameProps) {
  // Defensive: if a template arrives without the `{brand}` placeholder
  // (older translation that hasn't been migrated, or someone passed a
  // plain string by mistake), render it verbatim instead of appending
  // an orphan script span.
  if (!template.includes("{brand}")) return <>{template}</>;
  const [prefix, suffix = ""] = template.split("{brand}");
  return (
    <>
      {prefix}
      <span
        // tracking-normal forces letter-spacing back to 0 inside the
        // script span, because most callsites (home page heading,
        // wordmark blocks) use `tracking-tight` on the parent. Negative
        // letter-spacing breaks Parisienne's join strokes between
        // letters — the "i → n" connection visibly snaps mid-stroke.
        className={cn(
          "font-[family-name:var(--font-script)] font-normal align-baseline tracking-normal",
          scriptClassName
        )}
      >
        {brand}
      </span>
      {suffix}
    </>
  );
}
