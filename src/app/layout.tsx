import type { Metadata } from "next";
import { DM_Sans, Bodoni_Moda, Parisienne } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { AddItemFab } from "@/components/add-item-fab";
import { PendingUploadsProvider } from "@/lib/pending-uploads-context";
import { LaunchSplash } from "@/components/launch-splash";
import { SwRegister } from "@/components/sw-register";
import { DOCUMENT_PAGE_PATTERN } from "@/lib/document-pages";
import { THEME_COLORS, THEME_OVERRIDE_ID, THEME_STORAGE_KEY } from "@/lib/theme";
import { SHELL_ATTRIBUTE, SHELL_UA_MARKER } from "@/lib/native-shell";
import { NativeShell } from "@/components/native-shell";

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

// Hand-script for the brand L mark (splash + launch-page monogram).
// Parisienne — modern French-flavored hand-script, less formal than
// Pinyon but warmer than Bodoni. Reads as Linette's signature.
const parisienne = Parisienne({
  variable: "--font-script",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://linette.app"),
  title: "Linette — Your Personal Stylist",
  description:
    "Your wardrobe, beautifully organized. AI-powered outfit suggestions based on weather, mood, and occasion.",
  manifest: "/manifest.json",
  applicationName: "Linette",
  // OG + Twitter share previews. The image itself is auto-resolved by
  // Next.js from src/app/opengraph-image.png and src/app/twitter-image.png
  // (file-system convention). Explicit metadata block sets the title /
  // description / siteName so shared linette.app links show the right
  // text alongside the image on iMessage / Slack / Twitter / Facebook.
  openGraph: {
    title: "Linette — Your AI Stylist",
    description: "Your wardrobe, beautifully organized. For the closet you already own.",
    siteName: "Linette",
    url: "https://linette.app",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Linette — Your AI Stylist",
    description: "Your wardrobe, beautifully organized. For the closet you already own.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Linette",
    // No startupImage entries: the pre-baked PNGs were rendered from
    // the old Ivory · Noir palette and would flash a cream screen
    // before the animated white splash takes over. Letting iOS fall
    // back to the manifest's theme_color (#ffffff) gives a clean
    // white pre-paint that hands off to LaunchSplash invisibly.
  },
  // Icons come from app/icon.svg + app/apple-icon.png (Next file conventions).
  // Manifest still references the PWA-specific PNGs in /public for
  // installed-app icons.
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Linette",
  },
};

export const viewport = {
  // The browser bar takes the page's own background in each mode
  // (--background in globals.css: white, and #0a0a0a in dark).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  // The app follows the phone's light or dark mode unless the person
  // picked one in Settings (src/lib/theme.ts); the pre-paint script below
  // sets .dark either way. Declaring both also stops in-app webviews (Gmail,
  // Outlook) and Android's forced dark from inverting the page themselves.
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays ENABLED (audit a11y P2): maximumScale:1 +
  // userScalable:false blocked low-vision users from zooming anywhere
  // in the app. Modern iOS ignores the lock for accessibility anyway;
  // declaring it only hurt the platforms that honor it.
  // Required for env(safe-area-inset-*) to be non-zero in the installed
  // PWA — without it the black-translucent status bar and the iPhone
  // home indicator overlap the app chrome on every screen.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${bodoni.variable} ${parisienne.variable} h-full antialiased`}
      // The script below sets classes and data-locale before React runs.
      suppressHydrationWarning
    >
      <head>
        {/* Synchronously decide whether to skip the launch splash
            BEFORE any rendering. If the user already saw the splash
            this session, add a class to <html> so the splash CSS
            display:nones it instantly — no flash of the brand
            moment on every navigation. Same moment, the language for
            the text drawn before the code runs (BothLanguages): the
            locale store's cache, else the browser's language, exactly
            as the store itself decides (use-locale.ts). And .dark
            when the phone is in dark mode, kept in sync if it
            switches while the app is open (sunset schedules). First
            of all, data-shell when the page runs inside the Android
            app (src/lib/native-shell.ts), for the .web-only and
            .shell-only rules in globals.css. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;if(navigator.userAgent.indexOf('${SHELL_UA_MARKER}')!==-1)d.setAttribute('${SHELL_ATTRIBUTE}','android');try{if(sessionStorage.getItem('linette_splash_seen')==='1')d.classList.add('skip-splash');}catch(e){}if(new RegExp('${DOCUMENT_PAGE_PATTERN}').test(location.pathname))d.classList.add('skip-splash');try{var l=localStorage.getItem('locale:v1');if(l!=='en'&&l!=='fr'){l=(navigator.language||'').toLowerCase().indexOf('fr')===0?'fr':'en';}d.setAttribute('data-locale',l);}catch(e){}try{var m=window.matchMedia('(prefers-color-scheme: dark)'),s=function(){var t=null;try{t=localStorage.getItem('${THEME_STORAGE_KEY}');}catch(e){}var k=t==='dark'||(t!=='light'&&m.matches);d.classList.toggle('dark',k);var x=document.getElementById('${THEME_OVERRIDE_ID}');if(t==='dark'||t==='light'){if(!x){x=document.createElement('meta');x.id='${THEME_OVERRIDE_ID}';x.name='theme-color';document.head.insertBefore(x,document.head.firstChild);}x.content=k?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';}else if(x){x.parentNode.removeChild(x);}};s();if(m.addEventListener)m.addEventListener('change',s);else if(m.addListener)m.addListener(s);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background font-[family-name:var(--font-sans)]">
        <PendingUploadsProvider>
          <main className="flex-1 pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <AddItemFab />
          <BottomNav />
          <LaunchSplash />
          <SwRegister />
          <NativeShell />
        </PendingUploadsProvider>
      </body>
    </html>
  );
}
