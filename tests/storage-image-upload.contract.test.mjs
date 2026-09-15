import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("owner shop image uploads are covered by the deployed storage ownership function", async () => {
  const migration = await source("supabase/migrations/20260916090000_allow_owner_shop_image_uploads.sql");
  const hardening = await source("supabase/storage-production-hardening.sql");
  const ownerShop = await source("app/owner/shop/page.jsx");

  for (const sql of [migration, hardening]) {
    assert.match(sql, /Shop logos and QR images use \{business_id\}\/\{filename\}/);
    assert.match(sql, /from public\.businesses b[\s\S]*?where b\.id = folders\[1\]::uuid[\s\S]*?and b\.owner_id = current_user_id/);
  }

  assert.match(ownerShop, /const fileName = `\$\{businessId\}\/\$\{prefix\}_\$\{Date\.now\(\)\}\.\$\{ext\}`/);
  assert.match(ownerShop, /\.from\(IMAGE_BUCKET\)/);
});
