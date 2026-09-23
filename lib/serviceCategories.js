export const SERVICE_CATEGORIES = Object.freeze([
  {
    name: "Digital Printing",
    description: "Everyday paper printing for business and personal needs.",
    examples: "Flyers, business cards, invitations, documents, posters",
  },
  {
    name: "Inkjet Printing",
    description: "Detailed color printing for photos and vibrant materials.",
    examples: "Photos, documents, stickers, colored prints",
  },
  {
    name: "Laser Printing",
    description: "Sharp, fast printing for professional documents and cards.",
    examples: "Documents, certificates, business cards, reports",
  },
  {
    name: "Large Format Printing",
    description: "Oversized prints for indoor and outdoor displays.",
    examples: "Tarpaulins, banners, posters, signage",
  },
  {
    name: "Sublimation Printing",
    description: "Full-color designs for coated gifts and polyester items.",
    examples: "T-shirts, mugs, tumblers, jerseys, souvenirs",
  },
  {
    name: "Heat Transfer Printing",
    description: "Transfers for apparel, uniforms, and fabric products.",
    examples: "T-shirts, tote bags, uniforms, apparel",
  },
  {
    name: "Screen Printing",
    description: "Durable ink printing for apparel and merchandise.",
    examples: "T-shirts, uniforms, tote bags, merchandise",
  },
  {
    name: "UV Printing",
    description: "Direct-to-surface printing on rigid and specialty materials.",
    examples: "Acrylic, PVC, wood, phone cases, signage, souvenirs",
  },
  {
    name: "Sticker Printing",
    description: "Custom adhesive prints for products, packaging, and branding.",
    examples: "Product labels, decals, stickers, packaging",
  },
]);

export const SERVICE_CATEGORY_NAMES = Object.freeze(SERVICE_CATEGORIES.map(({ name }) => name));

const normalizeText = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[&/]+/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ");

const CATEGORY_ALIASES = [
  ["Sticker Printing", /\b(?:stickers?|labels?|decals?|packaging seal)\b/],
  ["Sublimation Printing", /\b(?:sublimation|mug|tumbler|souvenir|giveaway)\b/],
  ["Heat Transfer Printing", /\b(?:heat transfer|dtf|vinyl transfer|t shirts? printing|tee printing|textile|fabric|apparel)\b/],
  ["Screen Printing", /\bscreen printing\b/],
  ["UV Printing", /\b(?:uv printing|acrylic|pvc|phone case)\b/],
  ["Large Format Printing", /\b(?:large format|tarpaulins?|banners?|signage|billboards?|posters?)\b/],
  ["Inkjet Printing", /\b(?:inkjet|photo|photograph|photo print)\b/],
  ["Laser Printing", /\blaser printing\b/],
  ["Digital Printing", /\b(?:digital printing|offset printing|flyer|brochure|business cards?|cards?|invitation|stationery|document|certificate|report|id cards?|paper|print)\b/],
];

/**
 * Keep catalog categories inside the approved list while preserving useful
 * meaning for older services that used the previous free-text categories.
 */
export function normalizeServiceCategory(category, context = "") {
  const normalizedCategory = normalizeText(category);
  const exact = SERVICE_CATEGORIES.find((item) => normalizeText(item.name) === normalizedCategory);
  if (exact) return exact.name;

  const searchableText = normalizeText(`${category || ""} ${context || ""}`);
  return CATEGORY_ALIASES.find(([, matcher]) => matcher.test(searchableText))?.[0] || "Digital Printing";
}
