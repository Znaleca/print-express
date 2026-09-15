/**
 * Search helpers for the customer-facing shop directories.
 *
 * The public pages receive one row per business with its public catalog rows
 * nested under `catalog` (or the legacy `services` field). Keeping matching
 * here makes the browse and directory pages use the same normalization and
 * avoids subtly different search results.
 */
export function normalizeShopSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicCatalogItems(shop) {
  const source = Array.isArray(shop?.catalog)
    ? shop.catalog
    : Array.isArray(shop?.services)
      ? shop.services
      : [];

  return source.filter((item) => {
    if (typeof item === "string") return Boolean(item.trim());
    return item && item.available !== false;
  });
}

function addField(fields, kind, value, display = value) {
  const normalized = normalizeShopSearchText(value);
  if (!normalized) return;
  fields.push({ kind, normalized, display: String(display || value).trim() });
}

export function getShopSearchFields(shop) {
  const fields = [];
  addField(fields, "shop", shop?.name, shop?.name);
  addField(fields, "location", shop?.address, shop?.address);
  addField(fields, "profile", shop?.description, shop?.description);
  addField(fields, "profile", shop?.products_summary, shop?.products_summary);

  publicCatalogItems(shop).forEach((item) => {
    if (typeof item === "string") {
      addField(fields, "catalog", item, item);
      return;
    }

    const kind = item.item_type === "product" ? "product" : "service";
    addField(fields, kind, item.name, item.name);
    addField(fields, "category", item.category, item.category);
    addField(fields, "catalog", item.description, item.name);
  });

  return fields;
}

export function getShopSearchResult(shop, query) {
  const normalizedQuery = normalizeShopSearchText(query);
  if (!normalizedQuery) {
    return { matched: true, matches: [], matchReason: "" };
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const fields = getShopSearchFields(shop);
  const allText = fields.map((field) => field.normalized).join(" ");
  const matched = queryTerms.every((term) => allText.includes(term));

  if (!matched) return { matched: false, matches: [], matchReason: "" };

  const matchingFields = fields.filter((field) =>
    queryTerms.every((term) => field.normalized.includes(term))
  );
  const fallbackFields = fields.filter((field) =>
    queryTerms.some((term) => field.normalized.includes(term))
  );
  const matches = [...new Set(
    (matchingFields.length > 0 ? matchingFields : fallbackFields)
      .map((field) => field.display)
      .filter(Boolean)
  )].slice(0, 3);

  return {
    matched: true,
    matches,
    matchReason: matches.length > 0 ? `Matches: ${matches.join(", ")}` : "",
  };
}
