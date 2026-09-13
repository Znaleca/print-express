import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("revoking shop approval resets required documents through an admin-only RPC", async () => {
  const migration = await readFile(path.join(root, "supabase/migrations/20260913160000_revoke_business_verification.sql"), "utf8");
  const route = await readFile(path.join(root, "app/api/admin/verifications/route.js"), "utf8");
  const panel = await readFile(path.join(root, "components/admin/VerificationPanel.jsx"), "utf8");

  assert.match(migration, /admin_revoke_business_verification/);
  assert.match(migration, /security definer/);
  assert.match(migration, /status = 'PENDING'/);
  assert.match(migration, /DTI.*MAYORS_PERMIT.*BIR.*VALID_ID/s);
  assert.match(migration, /revoke all on function public\.admin_revoke_business_verification/);
  assert.match(migration, /grant execute on function public\.admin_revoke_business_verification[\s\S]*service_role/);
  assert.match(route, /shopAction/);
  assert.match(route, /"REVOKE"/);
  assert.match(route, /admin_revoke_business_verification/);
  assert.match(panel, /shopAction: "REVOKE"/);
  assert.match(panel, /status: "PENDING"/);
  assert.match(panel, /All four documents are pending review again/);
});
