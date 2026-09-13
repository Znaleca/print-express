export const PRODUCTION_SITE_URL = "https://www.pressandpresent.me";
export const LOCAL_SITE_URL = "http://localhost:3000";

const LEGACY_HOSTS = new Set([
  "press-and-present.vercel.app",
  "pressandpresent.vercel.app",
]);

function normalizeConfiguredUrl(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;

  try {
    const url = new URL(rawValue.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    if (url.pathname !== "/" && url.pathname !== "") return null;

    const host = url.hostname.toLowerCase();
    if (LEGACY_HOSTS.has(host)) return null;
    if (url.protocol === "http:" && host === "127.0.0.1" && url.port === "3000") return LOCAL_SITE_URL;
    return url.origin;
  } catch {
    return null;
  }
}

function isAllowedSiteUrl(url, isProduction) {
  return isProduction ? url === PRODUCTION_SITE_URL : url === LOCAL_SITE_URL;
}

/**
 * Return the one application origin that may be used for absolute links.
 *
 * Production intentionally accepts only the canonical public origin. During
 * local development it accepts only localhost, so a stale production value
 * can never redirect a local browser or send local emails to production.
 */
export function getConfiguredAppUrl({ env = process.env } = {}) {
  const isProduction = env.NODE_ENV === "production";
  const candidates = isProduction
    ? [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL, env.NEXT_PUBLIC_URL]
    : [env.NEXT_PUBLIC_SITE_URL, env.SITE_URL, env.NEXT_PUBLIC_URL];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeConfiguredUrl(candidate);
    if (normalizedUrl && isAllowedSiteUrl(normalizedUrl, isProduction)) return normalizedUrl;
  }

  return isProduction ? PRODUCTION_SITE_URL : LOCAL_SITE_URL;
}

/** Build an absolute URL without duplicate slashes or a trailing origin slash. */
export function getAppUrl(pathname = "/", options) {
  const path = String(pathname || "/").trim();
  const relativePath = path.startsWith("/") ? path : `/${path}`;
  return new URL(relativePath, `${getConfiguredAppUrl(options)}/`).toString();
}

export function getAuthRedirectUrl(options) {
  return getAppUrl("/auth/confirm", options);
}
