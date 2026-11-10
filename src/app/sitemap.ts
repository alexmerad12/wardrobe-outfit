import type { MetadataRoute } from "next";

const BASE = "https://linette.app";

// The pages a visitor can read without an account.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/launch`, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/delete-account`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
