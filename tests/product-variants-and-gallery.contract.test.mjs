import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("products support a gallery, variants, and server-authoritative variant checkout", async () => {
  const ownerForm = await source("components/owner/ServiceFormModal.jsx");
  const businessPage = await source("app/business/[id]/page.jsx");
  const checkoutPage = await source("app/checkout/[id]/page.jsx");
  const editPage = await source("app/owner/services/[id]/page.jsx");
  const catalogPage = await source("app/owner/services/page.jsx");
  const migration = await source("supabase/migrations/20260922100000_product_variants_and_gallery_checkout.sql");

  assert.match(ownerForm, /MAX_PRODUCT_IMAGES = 8/);
  assert.match(ownerForm, /multiple/);
  assert.match(ownerForm, /image_urls: finalImageUrls/);
  assert.match(ownerForm, /Product variants/);
  assert.match(ownerForm, /variantStockTotal/);
  assert.match(ownerForm, /Add variant/);
  assert.match(ownerForm, /Available Quantity \/ Capacity/);
  assert.match(ownerForm, /stock_qty: cleanVariants\.length > 0/);
  assert.match(businessPage, /getProductImages/);
  assert.match(businessPage, /getProductVariants/);
  assert.match(businessPage, /selectedVariantId/);
  assert.match(businessPage, /variant_id: selectedVariant\?\.id/);
  assert.match(businessPage, /productImages\.map/);
  assert.match(businessPage, /sizeQuantities/);
  assert.match(businessPage, /size_breakdown/);
  assert.match(businessPage, /Choose sizes and quantities/);
  assert.match(businessPage, /checkedCartItemKeys/);
  assert.match(businessPage, /toggleSelectAllCartItems/);
  assert.match(businessPage, /checkout_cart_\$\{id\}/);
  assert.match(businessPage, /Sizes: \$\{selectedSpecs\.size_breakdown/);
  assert.match(businessPage, /Total quantity:/);
  assert.match(checkoutPage, /specs_json/);
  assert.match(checkoutPage, /checkout_cart_\$\{businessId\}/);
  assert.match(checkoutPage, /variant_name/);
  assert.match(editPage, /variants: Array\.isArray\(baseSpecs\.variants\)/);
  assert.match(editPage, /const safeStockQty = Math\.max\(0, Number\.parseInt\(values\.stock_qty/);
  assert.match(catalogPage, /Available Capacity:/);
  assert.match(catalogPage, /handleStockUpdate\(item/);
  assert.match(migration, /place_order_atomic/);
  assert.match(migration, /Choose a product variant before checkout/);
  assert.match(migration, /updated_variants/);
  assert.match(migration, /variant_stock - quantity/);
});
