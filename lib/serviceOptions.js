const PAPER_MATERIALS = [
  "Bond Paper (80gsm)",
  "Glossy Paper (220gsm)",
  "Matte Cardstock (300gsm)",
  "Outdoor Vinyl Tarpaulin",
  "Waterproof Glossy Sticker",
  "Clear Vinyl Sticker",
];

const PRINT_QUALITIES = [
  "Standard Quality (720 DPI)",
  "High Quality (1440 DPI)",
  "Ultra Premium Photo Grade",
];

const CATEGORY_OPTION_CONFIGS = {
  apparel: {
    materialLabel: "Fabric / garment type",
    qualityLabel: "Print method",
    addMaterialLabel: "Add fabric",
    addQualityLabel: "Add print method",
    materials: ["Cotton", "Polyester", "Cotton-Polyester Blend", "Dri-Fit"],
    qualities: ["DTF Transfer", "Sublimation", "Screen Printing", "DTG Printing"],
  },
  tarpaulin: {
    materialLabel: "Banner material",
    qualityLabel: "Print finish",
    addMaterialLabel: "Add material",
    addQualityLabel: "Add finish",
    materials: ["Outdoor Vinyl Tarpaulin", "Mesh Banner", "Backlit Flex"],
    qualities: ["Standard Outdoor Print", "High-Resolution Print", "Weather-Resistant Print"],
  },
  poster: {
    materialLabel: "Poster stock",
    qualityLabel: "Print finish",
    addMaterialLabel: "Add poster stock",
    addQualityLabel: "Add finish",
    materials: ["Matte Poster Paper", "Glossy Poster Paper", "Photo Paper"],
    qualities: ["Standard Print", "High-Resolution Print", "Photo Quality"],
  },
  mug: {
    materialLabel: "Mug / tumbler type",
    qualityLabel: "Print finish",
    addMaterialLabel: "Add mug type",
    addQualityLabel: "Add finish",
    materials: ["11 oz Ceramic Mug", "15 oz Ceramic Mug", "Magic Mug", "16 oz Tumbler"],
    qualities: ["Standard Sublimation", "Photo Sublimation", "Full-Wrap Print"],
  },
  sticker: {
    materialLabel: "Sticker material",
    qualityLabel: "Cut / finish",
    addMaterialLabel: "Add sticker material",
    addQualityLabel: "Add cut / finish",
    materials: ["Glossy Vinyl Sticker", "Matte Vinyl Sticker", "Clear Vinyl Sticker", "Paper Sticker"],
    qualities: ["Standard Cut", "Kiss-Cut", "Die-Cut"],
  },
  "business-card": {
    materialLabel: "Card stock",
    qualityLabel: "Print finish",
    addMaterialLabel: "Add card stock",
    addQualityLabel: "Add finish",
    materials: ["Matte Cardstock (300gsm)", "Glossy Cardstock (300gsm)", "Premium Cardstock"],
    qualities: ["Single-Sided Print", "Double-Sided Print", "High-Resolution Print"],
  },
  "id-card": {
    materialLabel: "Card material",
    qualityLabel: "Card finish",
    addMaterialLabel: "Add card material",
    addQualityLabel: "Add card finish",
    materials: ["PVC Card", "Teslin Card", "Laminated Cardstock"],
    qualities: ["Single-Sided Print", "Double-Sided Print", "Laminated Finish"],
  },
  photo: {
    materialLabel: "Photo paper",
    qualityLabel: "Photo quality",
    addMaterialLabel: "Add photo paper",
    addQualityLabel: "Add photo quality",
    materials: ["Glossy Photo Paper", "Matte Photo Paper", "Luster Photo Paper"],
    qualities: ["Standard Photo", "High-Resolution Photo", "Photo Lab Quality"],
  },
  paper: {
    materialLabel: "Paper stock & materials",
    qualityLabel: "Print quality levels",
    addMaterialLabel: "Add paper",
    addQualityLabel: "Add quality",
    materials: PAPER_MATERIALS,
    qualities: PRINT_QUALITIES,
  },
};

const DEFAULT_OPTION_CONFIG = CATEGORY_OPTION_CONFIGS.paper;
const ALL_KNOWN_OPTION_NAMES = new Set(
  Object.values(CATEGORY_OPTION_CONFIGS).flatMap((config) => [...config.materials, ...config.qualities]),
);

export function getCategoryOptionConfig(categoryKey) {
  return CATEGORY_OPTION_CONFIGS[categoryKey] || DEFAULT_OPTION_CONFIG;
}

export function normalizeConfiguredOptions(values, config, optionType) {
  const current = Array.isArray(values) ? values : [];
  const knownOptions = new Set(config[optionType]);
  const customOptions = current.filter((option) => !ALL_KNOWN_OPTION_NAMES.has(option));
  const compatibleOptions = current.filter((option) => knownOptions.has(option));
  const nextOptions = [...new Set([...compatibleOptions, ...customOptions])];

  return nextOptions.length > 0 ? nextOptions : config[optionType].slice(0, 1);
}

export function getKnownOptionNames() {
  return ALL_KNOWN_OPTION_NAMES;
}
