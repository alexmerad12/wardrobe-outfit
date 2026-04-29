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
    startupImage: [
      { url: "/splash/iphone-15-pro-max.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/iphone-15-pro.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/iphone-13.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/iphone-mini.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/iphone-xr.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/splash/iphone-se.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/splash/ipad-11.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/splash/ipad-12-9.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" },
    ],
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
