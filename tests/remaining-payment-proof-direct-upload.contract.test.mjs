import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("remaining payment proofs upload directly to Supabase before metadata submission", async () => {
  const page = await source("app/track/page.jsx");
  const route = await source("app/api/orders/payment-proof/route.js");
  const migration = await source("supabase/migrations/20260924180000_direct_remaining_payment_proofs.sql");

  assert.match(page, /storage\s*\.from\(PRIVATE_ASSETS_BUCKET\)[\s\S]*\.upload\(/);
  assert.match(page, /`payments\/\$\{sessionData\.session\.user\.id\}\/\$\{order\.id\}\//);
  assert.match(page, /proofStoragePath: toStorageRef\(PRIVATE_ASSETS_BUCKET, uploadedPaymentPath\)/);
  assert.doesNotMatch(page, /new FormData\(\)/, "the tracking flow must not send payment files through Vercel");

  assert.match(route, /proofStoragePath/);
  assert.doesNotMatch(route, /request\.formData\(\)|arrayBuffer\(\)|Buffer\.from\(/, "the API must not parse or buffer uploaded file bytes");

  assert.match(migration, /Customers can upload remaining payment proofs/);
  assert.match(migration, /Customers can delete remaining payment proofs/);
  assert.match(migration, /Authorized users can view remaining payment proofs/);
});
