import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shop schedule uses inclusive opening and exclusive closing boundaries", async () => {
  const migration = await source("supabase/migrations/20260916120000_unconfigured_days_are_closed.sql");

  assert.match(migration, /local_time >= hours_row\.opens_at/);
  assert.match(migration, /local_time < hours_row\.closes_at/);
  assert.match(migration, /now\(\) at time zone coalesce/);
  assert.match(migration, /previous_hours_row\.opens_at > previous_hours_row\.closes_at/);
  assert.match(migration, /return found/);
});

test("owner close persists while owner open resumes the weekly schedule", async () => {
  const ownerShop = await source("app/owner/shop/page.jsx");
  const cleanupMigration = await source("supabase/migrations/20260916110000_resume_schedule_instead_of_forced_open.sql");

  assert.match(ownerShop, /manual_open_override: false/);
  assert.match(ownerShop, /manual_open_override: null/);
  assert.doesNotMatch(ownerShop, /manual_open_override: next/);
  assert.match(ownerShop, /Shop closed until you turn it back on/);
  assert.match(ownerShop, /Unconfigured days stay closed/);
  assert.match(cleanupMigration, /where manual_open_override is true/);
});

test("owner and customer shop pages refresh status at minute boundaries", async () => {
  const ownerShop = await source("app/owner/shop/page.jsx");
  const customerShop = await source("app/business/[id]/page.jsx");
  const browse = await source("app/browse/page.jsx");
  const shops = await source("app/shops/page.jsx");
  const refresh = await source("lib/openStateRefresh.js");

  assert.match(ownerShop, /startMinuteAlignedRefresh/);
  assert.match(customerShop, /startMinuteAlignedRefresh/);
  assert.match(browse, /startMinuteAlignedRefresh/);
  assert.match(shops, /startMinuteAlignedRefresh/);
  assert.match(refresh, /MINUTE_MS - \(now % MINUTE_MS\)/);
  assert.match(refresh, /setInterval/);
});
