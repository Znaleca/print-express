import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function migrationSource() {
  const directory = path.join(root, "supabase/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  return (await Promise.all(files.map((file) => readFile(path.join(directory, file), "utf8")))).join("\n");
}

test("customer reads explicitly request approved active shops", async () => {
  const customerPages = [
    "app/browse/page.jsx",
    "app/shops/page.jsx",
    "app/business/[id]/page.jsx",
    "app/checkout/[id]/page.jsx",
  ];

  for (const page of customerPages) {
    const content = await source(page);
    assert.match(content, /\.eq\("status",\s*"APPROVED"\)/, `${page} must filter approved shops`);
    assert.match(content, /\.eq\("lifecycle_state",\s*"ACTIVE"\)/, `${page} must filter active shops`);
  }
});

test("database visibility and checkout remain protected by lifecycle state", async () => {
  const sql = await migrationSource();

  assert.match(sql, /create or replace function public\.is_business_customer_visible/);
  assert.match(sql, /b\.status\s*=\s*'APPROVED'/);
  assert.match(sql, /b\.lifecycle_state\s*=\s*'ACTIVE'/);
  assert.match(sql, /not public\.is_business_inactivity_expired\(b\.id\)/);
  assert.match(sql, /create or replace function public\.place_order_atomic[\s\S]*?for update/);
  assert.match(sql, /create or replace function public\.place_order_atomic[\s\S]*?lifecycle_state\s*<>\s*'ACTIVE'/);
});

test("admin lifecycle controls do not expose shop deletion", async () => {
  const route = await source("app/api/admin/shops/lifecycle/route.js");
  const lifecycleSql = await migrationSource();

  assert.match(route, /\["LOCK",\s*"UNLOCK",\s*"ARCHIVE"\]/);
  assert.doesNotMatch(route, /DELETE/);
  assert.match(lifecycleSql, /shop_lifecycle_audit/);
  assert.match(lifecycleSql, /owner_reactivate_shop/);
});
