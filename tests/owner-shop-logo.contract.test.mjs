import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("owner shop logo preview uses a responsive banner frame", async () => {
  const shop = await readFile(path.join(root, "app/owner/shop/page.jsx"), "utf8");

  assert.match(shop, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  assert.match(shop, /h-32 w-full max-w-\[260px\].*object-contain/);
  assert.doesNotMatch(shop, /h-36 w-36 rounded-2xl border border-\[#D8D6CE\]/);
});
