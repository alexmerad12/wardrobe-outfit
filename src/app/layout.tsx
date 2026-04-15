import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wardrobe - Your Personal Stylist",
  description:
    "Digitize your wardrobe and get AI-powered outfit suggestions based on weather, mood, and occasion.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-[family-name:var(--font-sans)]">
        <main className="flex-1 pb-20">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
