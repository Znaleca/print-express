import { getAppUrl, getConfiguredAppUrl } from "@/lib/appUrl";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/about", "/privacy", "/terms", "/browse", "/shops", "/business/"],
      disallow: ["/admin/", "/owner/", "/account-settings", "/api/", "/auth/", "/checkout/", "/messages", "/reset-password", "/track"],
    },
    host: getConfiguredAppUrl(),
    sitemap: getAppUrl("/sitemap.xml"),
  };
}
