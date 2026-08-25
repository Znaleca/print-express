import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("checkout payment proofs use the authenticated customer storage namespace", async () => {
  const page = await source("app/checkout/[id]/page.jsx");
  const atomicCheckout = await source("supabase/place-order-atomic.sql");

  assert.match(page, /supabase\.auth\.getUser\(\)/, "checkout must re-check the active session");
  assert.match(page, /const customerId = currentUser\.id/, "checkout must use the authenticated user id");
  assert.match(page, /`receipts\/\$\{customerId\}\//, "receipt uploads must be scoped to the authenticated user");
  assert.match(page, /toStorageRef\(PRIVATE_ASSETS_BUCKET, filePath\)/, "checkout must send a canonical storage reference");
  assert.match(atomicCheckout, /\^private-assets:receipts\/.*customer::text.*\//, "the database must validate receipt ownership");
});

