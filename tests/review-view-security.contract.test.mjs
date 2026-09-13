import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath = "supabase/migrations/20260913210000_security_invoker_visible_business_reviews.sql";

async function source(path) {
  return readFile(path, "utf8");
}

test("public review view uses caller RLS over a sanitized read model", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /alter view public\.business_reviews\s+set \(security_invoker = true\)/);
  assert.match(migration, /create table if not exists public\.visible_business_reviews_data/);
  assert.match(migration, /alter table public\.visible_business_reviews_data enable row level security/);
  assert.match(migration, /using \(public\.is_business_customer_visible\(business_id\)\)/);
  assert.match(migration, /create or replace function public\.sync_visible_business_review\(\)/);
  assert.match(migration, /create trigger sync_visible_business_review/);
  assert.match(migration, /create trigger sync_visible_business_review_customer/);
  assert.match(migration, /create view public\.visible_business_reviews\s+with \(security_invoker = true\)/);
  assert.match(migration, /revoke all on public\.visible_business_reviews\s+from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.visible_business_reviews\s+to anon, authenticated/);
  assert.doesNotMatch(migration, /create view public\.visible_business_reviews\s+as[\s\S]*from public\.business_reviews/);
});
