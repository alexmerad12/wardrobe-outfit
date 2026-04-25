"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/use-locale";

const NAV_ITEMS = [
  { href: "/", icon: Home, key: "home" },
  { href: "/wardrobe", icon: Shirt, key: "wardrobe" },
  { href: "/suggest", icon: Sparkles, key: "suggest" },
  { href: "/outfits", icon: Heart, key: "favorites" },
  { href: "/profile", icon: User, key: "profile" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  // Hide nav on auth + legal + design-preview pages
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/design")
  ) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-4">
        {NAV_ITEMS.map(({ href, icon: Icon, key }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5px]")} />
              <span className={cn(isActive && "font-semibold")}>{t(`nav.${key}`)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
