// Server-component layout — holds the metadata export so the
// "use client" page can still set the document title without
// duplicating it via a useEffect hack.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Linette",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
