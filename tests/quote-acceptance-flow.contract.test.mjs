import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("quote requests and acceptance stay in context and expose the cart action", async () => {
  const shop = await source("app/business/[id]/page.jsx");
  const customerMessages = await source("app/messages/page.jsx");
  const ownerMessages = await source("app/owner/messages/page.jsx");

  assert.match(shop, /Quote request sent for/);
  assert.match(shop, /router\.push\(`\/messages\?business=\$\{business\.id\}&conversation=\$\{conversation\.id\}`\)/);
  assert.match(shop, /catalog_price_min_total/);
  assert.match(shop, /catalog_price_max_total/);

  assert.doesNotMatch(ownerMessages, /selectedQuoteProofId/);
  assert.doesNotMatch(ownerMessages, /setSelectedQuoteProofId/);
  assert.doesNotMatch(ownerMessages, /Design version for this quote/);
  assert.match(ownerMessages, /proof_version: null/);
  assert.match(ownerMessages, /placeholder=\{quotePriceRange \|\| "e\.g\. 1500"\}/);
  assert.match(ownerMessages, /Catalog estimate for this request: \{quotePriceRange\}/);

  assert.match(customerMessages, /message_type: "quote_acceptance"/);
  assert.match(customerMessages, /localStorage\.setItem\(`cart_\$\{businessId\}`/);
  assert.match(customerMessages, /View in cart/);
  assert.match(customerMessages, /getProofsForInquiry\(scopeMessages, meta\.inquiry_message_id/);
  assert.match(customerMessages, /Preview every version/);
  assert.match(customerMessages, /designVersions\.map\(\(design\)/);
  assert.match(customerMessages, /designVersions\.length > 0 && !selectedDesign/);
  assert.match(customerMessages, /\.subscribe\(\(status\) =>/);
  assert.match(customerMessages, /fetchMessages\(activeConv\.id, true, msgLimitRef\.current\)/);
  assert.match(customerMessages, /Catalog estimate/);
  assert.doesNotMatch(customerMessages, /Accept quote &amp; continue to checkout/);

  assert.match(ownerMessages, /Customer accepted quote/);
  assert.match(ownerMessages, /Customer accepted · added to cart/);
  assert.match(ownerMessages, /Catalog range to verify/);
  assert.match(ownerMessages, /\.subscribe\(\(status\) =>/);
  assert.match(ownerMessages, /fetchMessages\(activeConv\.id, true\)/);
});
