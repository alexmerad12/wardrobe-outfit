// Server-component layout — holds the metadata export so the
// "use client" page can still set the document title.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Linette",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
