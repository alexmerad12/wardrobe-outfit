import type { MetadataRoute } from "next";

// Only the public pages are worth crawling: everything else sits behind
// sign-in and would answer a crawler with a redirect.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/launch", "/privacy", "/terms", "/faq", "/delete-account"],
      disallow: ["/api/", "/auth/", "/admin"],
    },
    sitemap: "https://linette.app/sitemap.xml",
  };
}
