import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_CATEGORY_NAMES, normalizeServiceCategory } from "../lib/serviceCategories.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the catalog exposes exactly the approved printing categories", () => {
  assert.deepEqual(SERVICE_CATEGORY_NAMES, [
    "Digital Printing",
    "Inkjet Printing",
    "Laser Printing",
    "Large Format Printing",
    "Sublimation Printing",
    "Heat Transfer Printing",
    "Screen Printing",
    "UV Printing",
    "Sticker Printing",
  ]);
});

test("legacy service categories are mapped to customer-friendly categories", () => {
  assert.equal(normalizeServiceCategory("Flyers & Brochures"), "Digital Printing");
  assert.equal(normalizeServiceCategory("Banners"), "Large Format Printing");
  assert.equal(normalizeServiceCategory("Mug Printing"), "Sublimation Printing");
  assert.equal(normalizeServiceCategory("T-Shirt Printing"), "Heat Transfer Printing");
  assert.equal(normalizeServiceCategory("Stickers & Labels"), "Sticker Printing");
  assert.equal(normalizeServiceCategory("", "acrylic phone case"), "UV Printing");
  assert.equal(normalizeServiceCategory("Something Unknown"), "Digital Printing");
});

test("owners can request categories without publishing unapproved categories", async () => {
  const form = await readFile(path.join(root, "components/owner/ServiceFormModal.jsx"), "utf8");

  assert.match(form, /category_approval_requests/);
  assert.match(form, /Send request to Admin/);
  assert.match(form, /will not add or publish a new category automatically/);
  assert.match(form, /SERVICE_CATEGORY_NAMES\.map/);
  assert.doesNotMatch(form, /FLAT_CATEGORIES/);
});

test("service editor refreshes category options and keeps visible steps sequential", async () => {
  const form = await readFile(path.join(root, "components/owner/ServiceFormModal.jsx"), "utf8");
  const editorPage = await readFile(path.join(root, "app/owner/services/[id]/page.jsx"), "utf8");

  assert.match(form, /const categoryPreset = CATEGORY_SIZE_PRESETS\.find/);
  assert.match(form, /const showSizeSection = hasConfigurableOptions && !isApparel/);
  assert.match(form, /const showCustomerOptions = hasConfigurableOptions/);
  assert.match(form, /const stepNumber = \(key\) => progressSteps\.findIndex/);
  assert.match(form, /\{stepNumber\("details"\)\}/);
  assert.match(form, /\{stepNumber\("price"\)\}/);
  assert.doesNotMatch(form, />2\. \{categoryOptionConfig\.materialLabel\}</);
  assert.doesNotMatch(form, />3\. \{categoryOptionConfig\.qualityLabel\}</);
  assert.doesNotMatch(editorPage, /\[\["1", "Details", "Name, category, image"\]/);
});
