import type { Metadata } from "next";
import { DM_Sans, Bodoni_Moda } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { PendingUploadsProvider } from "@/lib/pending-uploads-context";
import { LaunchSplash } from "@/components/launch-splash";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const bodoni = Bodoni_Moda({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Closette — Your Personal Stylist",
  description:
    "Your wardrobe, beautifully organized. AI-powered outfit suggestions based on weather, mood, and occasion.",
  manifest: "/manifest.json",
  applicationName: "Closette",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Closette",
    // No startupImage entries: the pre-baked PNGs were rendered from
    // the old Ivory · Noir palette and would flash a cream screen
    // before the animated white splash takes over. Letting iOS fall
    // back to the manifest's theme_color (#ffffff) gives a clean
    // white pre-paint that hands off to LaunchSplash invisibly.
  },
  // Icons come from app/icon.svg + app/apple-icon.tsx (Next file conventions),
  // which now render the Ivory · Noir mark. Manifest still references the
  // PWA-specific PNGs in /public for installed-app icons.
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Closette",
  },
};

export const viewport = {
  // Monochrome brand colour — matches manifest.json + the launch splash
  // so the iOS status bar / Android chrome / PWA splash all carry the
  // pure black-and-white identity.
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${bodoni.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-[family-name:var(--font-sans)]">
        <PendingUploadsProvider>
          <main className="flex-1 pb-20">{children}</main>
          <BottomNav />
          <LaunchSplash />
        </PendingUploadsProvider>
      </body>
    </html>
  );
}
