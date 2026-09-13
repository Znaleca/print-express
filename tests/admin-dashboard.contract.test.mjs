import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("admin dashboard uses protected aggregate data and bounded recent records", async () => {
  const page = await readFile(path.join(root, "app/admin/page.jsx"), "utf8");
  const route = await readFile(path.join(root, "app/api/admin/operations/route.js"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20260912110000_admin_operations_dashboard.sql"), "utf8");

  assert.match(page, /api\/admin\/operations\?range=/);
  assert.match(page, /ResponsiveContainer/);
  assert.match(page, /Platform pulse/);
  assert.match(page, /Action center/);
  assert.match(page, /Recent customer accounts/);
  assert.match(page, /AbortController/);
  assert.match(page, /Dashboard data unavailable/);
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /VALID_RANGES/);
  assert.match(route, /admin_operations_snapshot/);
  assert.match(route, /buildAdminOperationsFallback/);
  assert.match(migration, /security definer/);
  assert.match(migration, /p_requester_id uuid/);
  assert.match(migration, /limit 5/);
  assert.match(migration, /completed_revenue/);
});

test("dashboard aggregate keeps unsupported activity honest and uses real statuses", async () => {
  const page = await readFile(path.join(root, "app/admin/page.jsx"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20260912110000_admin_operations_dashboard.sql"), "utf8");

  assert.match(page, /No data in this range/);
  assert.match(page, /No refund or cancellation items found/);
  assert.match(page, /KPI totals are current/);
  assert.match(migration, /from public\.profiles/);
  assert.match(migration, /from public\.businesses/);
  assert.match(migration, /from public\.orders/);
  assert.match(migration, /from public\.category_approval_requests/);
  assert.doesNotMatch(page, /const (fake|mock|placeholder)/i);
});
