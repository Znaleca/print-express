import test from "node:test";
import assert from "node:assert/strict";
import { getShopSearchResult, normalizeShopSearchText } from "../lib/shopSearch.js";

const shop = {
  name: "Bright Prints",
  address: "Barangay San Jose, Balanga City",
  description: "Local print studio",
  products_summary: "Business cards and flyers",
  catalog: [
    { name: "Premium Business Cards", category: "Cards", item_type: "product", available: true },
    { name: "Tarpaulin Layout", category: "Large format", item_type: "service", available: true },
    { name: "Hidden Flyers", category: "Flyers", item_type: "product", available: false },
  ],
};

test("shop search normalizes case, punctuation, and whitespace", () => {
  assert.equal(normalizeShopSearchText("  Business-CARDS & flyers "), "business cards and flyers");
  assert.equal(getShopSearchResult(shop, "  business-cards ").matched, true);
  assert.equal(getShopSearchResult(shop, "BALANGA").matched, true);
});

test("shop search matches products, services, and categories without duplicates", () => {
  const result = getShopSearchResult(shop, "flyers");
  assert.equal(result.matched, true);
  assert.deepEqual(result.matches, ["Business cards and flyers"]);
  assert.match(result.matchReason, /Matches:/);
});

test("unavailable catalog rows cannot make a shop match", () => {
  assert.equal(getShopSearchResult(shop, "hidden flyers").matched, false);
  assert.equal(getShopSearchResult(shop, "not offered").matched, false);
});
