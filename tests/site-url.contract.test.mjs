import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAppUrl, getConfiguredAppUrl, getAuthRedirectUrl, LOCAL_SITE_URL, PRODUCTION_SITE_URL } from "../lib/appUrl.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("site URL helper keeps local and production origins isolated", () => {
  assert.equal(
    getConfiguredAppUrl({ env: { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3000/" } }),
    LOCAL_SITE_URL,
  );
  assert.equal(
    getConfiguredAppUrl({ env: { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "https://press-and-present.vercel.app" } }),
    LOCAL_SITE_URL,
  );
  assert.equal(
    getConfiguredAppUrl({ env: { NODE_ENV: "production", SITE_URL: "https://www.pressandpresent.me/" } }),
    PRODUCTION_SITE_URL,
  );
  assert.equal(
    getConfiguredAppUrl({ env: { NODE_ENV: "production", SITE_URL: "https://press-and-present.vercel.app" } }),
    PRODUCTION_SITE_URL,
  );
  assert.equal(getAppUrl("messages?business=shop-1", { env: { NODE_ENV: "development" } }), "http://localhost:3000/messages?business=shop-1");
  assert.equal(getAppUrl("/owner/orders", { env: { NODE_ENV: "production" } }), "https://www.pressandpresent.me/owner/orders");
  assert.equal(getAuthRedirectUrl({ env: { NODE_ENV: "production" } }), "https://www.pressandpresent.me/auth/confirm");
});

test("repository URL configuration uses host-scoped permanent legacy redirects", async () => {
  const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
  assert.equal(vercel.redirects.length, 2);
  for (const redirect of vercel.redirects) {
    assert.equal(redirect.source, "/:path*");
    assert.equal(redirect.destination, "https://www.pressandpresent.me/:path*");
    assert.equal(redirect.permanent, true);
    assert.equal(redirect.has[0].type, "host");
  }
});

test("Supabase local auth only advertises the canonical localhost callback", async () => {
  const config = await readFile(path.join(root, "supabase/config.toml"), "utf8");
  assert.match(config, /site_url = "http:\/\/localhost:3000"/);
  assert.match(config, /additional_redirect_urls = \["http:\/\/localhost:3000\/auth\/confirm"\]/);
  assert.doesNotMatch(config, /127\.0\.0\.1:3000/);
});

test("public footer legal links resolve to real pages and social links never use dead anchors", async () => {
  const footer = await readFile(path.join(root, "components/Footer.jsx"), "utf8");
  const sitemap = await readFile(path.join(root, "app/sitemap.js"), "utf8");

  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.doesNotMatch(footer, /href:\s*['"]#['"]|href="#"/);
  assert.match(footer, /NEXT_PUBLIC_FACEBOOK_URL/);
  assert.match(sitemap, /getAppUrl\("\/privacy"\)/);
  assert.match(sitemap, /getAppUrl\("\/terms"\)/);
});
