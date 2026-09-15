import { getAppUrl } from "@/lib/appUrl";

export default function sitemap() {
  const lastModified = new Date();
  return [
    { url: getAppUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: getAppUrl("/about"), lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: getAppUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: getAppUrl("/terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: getAppUrl("/browse"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: getAppUrl("/shops"), lastModified, changeFrequency: "daily", priority: 0.8 },
  ];
}
