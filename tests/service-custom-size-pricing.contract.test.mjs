import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("custom size uses the entered add-on price without multiplying by area", async () => {
  const modal = await readFile(path.join(root, "components/owner/ServiceFormModal.jsx"), "utf8");

  assert.match(modal, /const price = Number\.parseFloat\(customSize\.price\)/);
  assert.match(modal, /const modifier = Number\(price\.toFixed\(2\)\)/);
  assert.doesNotMatch(modal, /width \* height \* rate/);
  assert.match(modal, /Size details \+ add-on price/);
  assert.match(modal, /placeholder="Add-on price"/);
});
