// Server-component layout holds the metadata export. The page itself is
// a client component so it can read the user's locale via useLocale.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Linette",
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children;
}
