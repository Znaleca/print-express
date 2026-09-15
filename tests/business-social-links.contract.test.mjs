import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("optional shop social links replace the website field across shop surfaces", async () => {
  const ownerShop = await source("app/owner/shop/page.jsx");
  const publicShop = await source("app/business/[id]/page.jsx");
  const adminApi = await source("app/api/admin/shops/route.js");
  const adminPanel = await source("components/admin/ShopDetailsPanel.jsx");
  const migration = await source("supabase/migrations/20260916100000_business_social_links.sql");

  for (const field of ["facebook_url", "instagram_url", "tiktok_url"]) {
    assert.match(ownerShop, new RegExp(field));
    assert.match(publicShop, new RegExp(field));
    assert.match(adminApi, new RegExp(field));
    assert.match(migration, new RegExp(field));
  }
  assert.match(ownerShop, /isValidOptionalSocialUrl/);
  assert.match(ownerShop, /label: "Facebook"/);
  assert.match(ownerShop, /label: "Instagram"/);
  assert.match(ownerShop, /label: "TikTok"/);
  assert.match(ownerShop, /\(optional\)/);
  assert.doesNotMatch(ownerShop, /Website URL/);
  assert.doesNotMatch(ownerShop, /name="website"/);
  assert.match(publicShop, /Follow this shop/);
  assert.match(publicShop, /getSafeExternalUrl/);
  assert.match(adminPanel, /label="Facebook"/);
  assert.match(adminPanel, /label="Instagram"/);
  assert.match(adminPanel, /label="TikTok"/);
});
