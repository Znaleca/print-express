"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, ImagePlus, ImageOff, Layers, Sparkles, Plus, Trash2, ShieldAlert, AlertCircle, Send, Calculator, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import { getCategoryOptionConfig, getKnownOptionNames, normalizeConfiguredOptions } from "@/lib/serviceOptions";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_NAMES, normalizeServiceCategory } from "@/lib/serviceCategories";

const SIZE_PRESET_GROUPS = [
  {
    key: "paper",
    label: "Paper / document sizes",
    options: ["Standard (3.5\" x 2\")", "A4 (8.27\" x 11.69\")", "A3 (11.69\" x 16.54\")", "Letter (8.5\" x 11\")", "Legal (8.5\" x 14\")", "Short Bond (8.5\" x 11\")", "Long Bond (8.5\" x 13\")"],
  },
  {
    key: "business-card",
    label: "Business card sizes",
    options: ["Standard Business Card (3.5\" x 2\")"],
  },
  {
    key: "poster",
    label: "Poster sizes",
    options: ["A4 Poster (8.27\" x 11.69\")", "A3 Poster (11.69\" x 16.54\")", "A2 Poster (16.54\" x 23.39\")", "A1 Poster (23.39\" x 33.11\")", "A0 Poster (33.11\" x 46.81\")"],
  },
  {
    key: "clothing",
    label: "Clothing / textile sizes",
    options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  },
  {
    key: "tarpaulin",
    label: "Tarpaulin / banner sizes",
    options: ["2 x 3 ft Banner", "3 x 4 ft Banner", "4 x 6 ft Tarpaulin", "4 x 8 ft Tarpaulin", "5 x 10 ft Tarpaulin"],
  },
  {
    key: "photo",
    label: "ID / photo sizes",
    options: ["1 x 1 in ID Photo", "2 x 2 in ID Photo", "2 x 3 in ID Photo"],
  },
  {
    key: "id-card",
    label: "ID card sizes",
    options: ["Standard ID Card (85.6 x 54 mm)"],
  },
  {
    key: "sticker",
    label: "Sticker / label sizes",
    options: ["1 x 1 in Sticker", "2 x 2 in Sticker", "3 x 3 in Sticker", "4 x 6 in Sticker", "A4 Sticker Sheet"],
  },
  {
    key: "mug",
    label: "Mug / tumbler sizes",
    options: ["11 oz Mug", "15 oz Mug", "16 oz Tumbler"],
  },
];
const SIZE_PRESETS = [...new Set(SIZE_PRESET_GROUPS.flatMap((group) => group.options))];
const KNOWN_OPTION_NAMES = getKnownOptionNames();
const CATEGORY_SIZE_PRESETS = [
  {
    key: "paper",
    label: "Paper sizes",
    categories: ["Digital Printing", "Laser Printing"],
    options: ["A4 (8.27\" x 11.69\")", "A3 (11.69\" x 16.54\")", "Letter (8.5\" x 11\")", "Legal (8.5\" x 14\")", "Long Bond (8.5\" x 13\")"],
  },
  {
    key: "business-card",
    label: "Business card sizes",
    categories: ["Digital Printing", "Laser Printing"],
    options: ["Standard Business Card (3.5\" x 2\")"],
  },
  {
    key: "poster",
    label: "Poster sizes",
    categories: ["Digital Printing", "Inkjet Printing", "Large Format Printing"],
    options: ["A4 Poster (8.27\" x 11.69\")", "A3 Poster (11.69\" x 16.54\")", "A2 Poster (16.54\" x 23.39\")", "A1 Poster (23.39\" x 33.11\")", "A0 Poster (33.11\" x 46.81\")"],
  },
  {
    key: "apparel",
    label: "Clothing sizes",
    categories: ["Sublimation Printing", "Heat Transfer Printing", "Screen Printing"],
    options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  },
  {
    key: "tarpaulin",
    label: "Tarpaulin / banner sizes",
    categories: ["Large Format Printing"],
    options: ["2 x 3 ft Banner", "3 x 4 ft Banner", "4 x 6 ft Tarpaulin", "4 x 8 ft Tarpaulin", "5 x 10 ft Tarpaulin"],
  },
  {
    key: "photo",
    label: "ID and photo sizes",
    categories: ["Inkjet Printing"],
    options: ["1 x 1 in ID Photo", "2 x 2 in ID Photo", "2 x 3 in ID Photo"],
  },
  {
    key: "id-card",
    label: "ID card sizes",
    categories: ["Digital Printing", "Laser Printing"],
    options: ["Standard ID Card (85.6 x 54 mm)"],
  },
  {
    key: "sticker",
    label: "Sticker / label sizes",
    categories: ["Sticker Printing"],
    options: ["1 x 1 in Sticker", "2 x 2 in Sticker", "3 x 3 in Sticker", "4 x 6 in Sticker", "A4 Sticker Sheet"],
  },
  {
    key: "mug",
    label: "Mug / tumbler sizes",
    categories: ["Sublimation Printing"],
    options: ["11 oz Mug", "15 oz Mug", "16 oz Tumbler"],
  },
];
const NAME_PRESET_CATEGORY_COMPATIBILITY = {
  apparel: ["Sublimation Printing", "Heat Transfer Printing", "Screen Printing"],
  tarpaulin: ["Large Format Printing"],
  poster: ["Digital Printing", "Inkjet Printing", "Large Format Printing"],
  mug: ["Sublimation Printing"],
  sticker: ["Sticker Printing", "Inkjet Printing"],
  "id-card": ["Digital Printing", "Laser Printing"],
  "business-card": ["Digital Printing", "Laser Printing"],
  photo: ["Inkjet Printing"],
  paper: ["Digital Printing", "Inkjet Printing", "Laser Printing"],
};
const SIZE_NAME_MATCHERS = [
  ["apparel", /\b(?:t[\s-]?shirt|tee|polo|shirt|cloth|clothing|textile|fabric|apparel)\b/i],
  ["tarpaulin", /\b(?:tarpaulin|banner|large format)\b/i],
  ["poster", /\bposter\b/i],
  ["mug", /\b(?:mug|tumbler)\b/i],
  ["sticker", /\b(?:sticker|label)\b/i],
  ["id-card", /\b(?:id card|identification card)\b/i],
  ["business-card", /\bbusiness card\b/i],
  ["photo", /\b(?:photo|photocopy|passport)\b/i],
  ["paper", /\b(?:paper|document|flyer|brochure|bond)\b/i],
];
const MAX_PRODUCT_IMAGES = 8;
const MAX_PRODUCT_VARIANTS = 50;

const normalizeProductVariants = (variants = []) => (Array.isArray(variants) ? variants : [])
  .map((variant, index) => ({
    id: String(variant?.id || `variant-${index + 1}`),
    name: String(variant?.name || ""),
    sku: String(variant?.sku || ""),
    price: variant?.price != null ? String(variant.price) : "0",
    stock_qty: variant?.stock_qty != null ? String(variant.stock_qty) : "0",
  }));

const getInitialImageGallery = (initialValues, specs) => {
  const storedImages = Array.isArray(specs?.image_urls) ? specs.image_urls : [];
  return [...new Set([initialValues?.image_url, ...storedImages]
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .map((url) => ({ url, file: null }));
};
const getCategorySizePreset = (name = "", category = "") => {
  const namePresetKey = SIZE_NAME_MATCHERS.find(([, matcher]) => matcher.test(name))?.[0];
  const categoryPreset = CATEGORY_SIZE_PRESETS.find((preset) => preset.categories.includes(category));
  const namePresetIsCompatible = namePresetKey
    && (!category || NAME_PRESET_CATEGORY_COMPATIBILITY[namePresetKey]?.includes(category));

  return (namePresetIsCompatible && CATEGORY_SIZE_PRESETS.find((preset) => preset.key === namePresetKey))
    || categoryPreset
    || null;
};
const TSHIRT_SIZE_CHART = [
  { size: "XS", chest_width: "42–45 cm", body_length: "65–68 cm", fits_chest: "80–85 cm", price_modifier: "0" },
  { size: "S", chest_width: "45–48 cm", body_length: "68–71 cm", fits_chest: "86–91 cm", price_modifier: "0" },
  { size: "M", chest_width: "50–53 cm", body_length: "71–74 cm", fits_chest: "96–101 cm", price_modifier: "0" },
  { size: "L", chest_width: "55–58 cm", body_length: "74–77 cm", fits_chest: "106–111 cm", price_modifier: "0" },
  { size: "XL", chest_width: "60–63 cm", body_length: "77–80 cm", fits_chest: "116–121 cm", price_modifier: "0" },
  { size: "XXL", chest_width: "65–68 cm", body_length: "80–83 cm", fits_chest: "126–131 cm", price_modifier: "20" },
  { size: "XXXL", chest_width: "70–73 cm", body_length: "83–86 cm", fits_chest: "136–141 cm", price_modifier: "20" },
];

const mergeSizeChartRows = (sizes, currentRows = [], modifiers = {}) => {
  const currentBySize = new Map(currentRows.map((row) => [row.size, row]));
  const templateBySize = new Map(TSHIRT_SIZE_CHART.map((row) => [row.size, row]));

  return sizes.map((size) => {
    const current = currentBySize.get(size) || {};
    const template = templateBySize.get(size) || {};
    return {
      size,
      chest_width: current.chest_width || template.chest_width || "",
      body_length: current.body_length || template.body_length || "",
      fits_chest: current.fits_chest || template.fits_chest || "",
      price_modifier: modifiers[size] ?? current.price_modifier ?? template.price_modifier ?? "0",
    };
  });
};

const EMPTY_SPECS = {
  allowed_sizes: ["A4 (8.27\" x 11.69\")"],
  allowed_materials: ["Glossy Paper (220gsm)"],
  quality_levels: ["Standard Quality (720 DPI)"],
  price_modifiers: {
    "A3 (11.69\" x 16.54\")": 30,
    "Matte Cardstock (300gsm)": 20,
    "High Quality (1440 DPI)": 40
  },
  default_size: "A4 (8.27\" x 11.69\")",
  default_material: "Glossy Paper (220gsm)",
  default_quality: "Standard Quality (720 DPI)",
  size_chart: [],
  is_customizable: true
};

const EMPTY_SERVICE = {
  item_type: "service",
  name: "",
  description: "",
  price: "0",
  price_max: "",
  category: "",
  available: true,
  imageUrl: null,
  imageFile: null,
  imageGallery: [],
  removeImage: false,
  stock_qty: "",
  low_stock_threshold: 10,
  is_customizable: true,
  specs: {
    ...EMPTY_SPECS,
    allowed_sizes: [],
    price_modifiers: {},
    default_size: null,
  }
};

const EMPTY_PRODUCT = {
  item_type: "product",
  name: "",
  description: "",
  price: "0",
  price_max: "",
  category: "",
  available: true,
  imageUrl: null,
  imageFile: null,
  imageGallery: [],
  removeImage: false,
  stock_qty: "20",
  low_stock_threshold: 10,
  is_customizable: false,
  specs: {
    allowed_sizes: [],
    allowed_materials: [],
    quality_levels: [],
    price_modifiers: {},
    default_size: null,
    default_material: null,
    default_quality: null,
    size_chart: [],
    image_urls: [],
    variants: [],
    is_customizable: false
  }
};

export default function ServiceFormModal({ mode, initialValues, onSave, onClose, forcedType, businessId, embedded = false }) {
  const defaultType = forcedType || initialValues?.item_type || "service";

  const [form, setForm] = useState(() => {
    if (initialValues) {
      const existingSpecs = typeof initialValues.specs_json === 'string'
        ? (() => { try { return JSON.parse(initialValues.specs_json); } catch(e) { return {}; } })()
        : (initialValues.specs_json || {});
      const normalizedInitialCategory = normalizeServiceCategory(
        initialValues.category,
        `${initialValues.name || ""} ${initialValues.description || ""}`,
      );
      const initialCategoryPreset = getCategorySizePreset(initialValues.name || "", normalizedInitialCategory);
      const initialOptionConfig = getCategoryOptionConfig(initialCategoryPreset?.key || "paper");
      const initialAllowedSizes = existingSpecs.allowed_sizes || [];
      const categoryAllowedSizes = initialCategoryPreset
        ? initialAllowedSizes.filter((size) => !SIZE_PRESETS.includes(size) || initialCategoryPreset.options.includes(size))
        : initialAllowedSizes;
      const initialSizeChart = Array.isArray(existingSpecs.size_chart) ? existingSpecs.size_chart : [];
      const chartSizes = initialSizeChart.map((row) => String(row?.size || "").trim()).filter(Boolean);
      const apparelSizes = initialCategoryPreset?.key === "apparel"
        ? [
          ...initialCategoryPreset.options.filter((size) => categoryAllowedSizes.includes(size) || chartSizes.includes(size)),
          ...new Set([
            ...categoryAllowedSizes.filter((size) => !initialCategoryPreset.options.includes(size)),
            ...chartSizes.filter((size) => !initialCategoryPreset.options.includes(size)),
          ]),
        ]
        : categoryAllowedSizes;
      const hasConfiguredMaterials = Array.isArray(existingSpecs.allowed_materials) && existingSpecs.allowed_materials.length > 0;
      const hasConfiguredQualities = Array.isArray(existingSpecs.quality_levels) && existingSpecs.quality_levels.length > 0;
      const initialMaterials = hasConfiguredMaterials
        ? normalizeConfiguredOptions(existingSpecs.allowed_materials, initialOptionConfig, "materials")
        : (defaultType === "service" ? initialOptionConfig.materials.slice(0, 1) : []);
      const initialQualities = hasConfiguredQualities
        ? normalizeConfiguredOptions(existingSpecs.quality_levels, initialOptionConfig, "qualities")
        : (defaultType === "service" ? initialOptionConfig.qualities.slice(0, 1) : []);

      return {
        item_type:            initialValues.item_type || defaultType,
        name:                 initialValues.name || "",
        description:          initialValues.description || "",
        price:                initialValues.price != null ? String(initialValues.price) : "0",
        price_max:            initialValues.price_max != null ? String(initialValues.price_max) : "",
        category:             normalizedInitialCategory,
        available:            initialValues.available !== false,
        imageUrl:             initialValues.image_url || null,
        imageFile:            null,
        imageGallery:        defaultType === "product" ? getInitialImageGallery(initialValues, existingSpecs) : [],
        removeImage:          false,
        stock_qty:            initialValues.stock_qty != null ? String(initialValues.stock_qty) : "0",
        low_stock_threshold: initialValues.low_stock_threshold != null ? String(initialValues.low_stock_threshold) : "10",
        is_customizable:      initialValues.is_customizable !== false,
        specs: {
          allowed_sizes:     apparelSizes,
          allowed_materials: initialMaterials,
          quality_levels:    initialQualities,
          price_modifiers:   existingSpecs.price_modifiers || {},
          default_size:      apparelSizes.includes(existingSpecs.default_size) ? existingSpecs.default_size : (apparelSizes[0] || null),
          default_material:  initialMaterials.includes(existingSpecs.default_material) ? existingSpecs.default_material : (initialMaterials[0] || null),
          default_quality:   initialQualities.includes(existingSpecs.default_quality) ? existingSpecs.default_quality : (initialQualities[0] || null),
          size_chart:        initialCategoryPreset?.key === "apparel"
            ? mergeSizeChartRows(apparelSizes, initialSizeChart, existingSpecs.price_modifiers || {})
            : initialSizeChart,
          image_urls:        Array.isArray(existingSpecs.image_urls) ? existingSpecs.image_urls : [],
          variants:          normalizeProductVariants(existingSpecs.variants),
          is_customizable:   existingSpecs.is_customizable !== false,
        }
      };
    }
    return defaultType === "product" ? { ...EMPTY_PRODUCT } : { ...EMPTY_SERVICE };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [categoryRequestName, setCategoryRequestName] = useState("");
  const [categoryRequestReason, setCategoryRequestReason] = useState("");
  const [categoryRequestLoading, setCategoryRequestLoading] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState(null);
  const [customSize, setCustomSize] = useState({ label: "", width: "", height: "", unit: "in", price: "" });
  const [customMaterial, setCustomMaterial] = useState({ label: "", modifier: "" });
  const [customQuality, setCustomQuality] = useState({ label: "", modifier: "" });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleCategoryChange = (category) => {
    setForm((f) => {
      const nextPreset = getCategorySizePreset(f.name, category);
      const nextOptionConfig = getCategoryOptionConfig(nextPreset?.key || "paper");
      const customSizes = (f.specs?.allowed_sizes || []).filter((size) => !SIZE_PRESETS.includes(size));
      const nextMaterials = normalizeConfiguredOptions(f.specs?.allowed_materials, nextOptionConfig, "materials");
      const nextQualities = normalizeConfiguredOptions(f.specs?.quality_levels, nextOptionConfig, "qualities");
      const nextOptionNames = new Set([...customSizes, ...nextMaterials, ...nextQualities]);
      const nextModifiers = Object.fromEntries(
        Object.entries(f.specs?.price_modifiers || {}).filter(([optionName]) => nextOptionNames.has(optionName)),
      );
      const nextChart = nextPreset?.key === "apparel"
        ? mergeSizeChartRows(customSizes, f.specs?.size_chart || [], nextModifiers)
        : [];
      return {
        ...f,
        category,
        specs: {
          ...(f.specs || {}),
          // Standard sizes belong to the selected category. Keep only sizes
          // the owner explicitly added as custom when changing categories.
          allowed_sizes: customSizes,
          allowed_materials: nextMaterials,
          quality_levels: nextQualities,
          price_modifiers: nextModifiers,
          default_size: customSizes[0] || "",
          default_material: nextMaterials[0] || "",
          default_quality: nextQualities[0] || "",
          size_chart: nextChart,
        },
      };
    });
  };

  const toggleOption = (categoryKey, optionName) => {
    setForm((f) => {
      const currentList = f.specs?.[categoryKey] || [];
      const isSelected = currentList.includes(optionName);
      const updatedList = isSelected ? currentList.filter(item => item !== optionName) : [...currentList, optionName];
      
      const newModifiers = { ...(f.specs?.price_modifiers || {}) };
      if (isSelected) {
        delete newModifiers[optionName];
      }

      const preset = getCategorySizePreset(f.name, f.category);
      if (categoryKey === "allowed_sizes" && preset?.key === "apparel") {
        updatedList.forEach((size) => {
          if (newModifiers[size] == null) {
            newModifiers[size] = TSHIRT_SIZE_CHART.find((row) => row.size === size)?.price_modifier || 0;
          }
        });
      }
      const nextSizeChart = categoryKey === "allowed_sizes" && preset?.key === "apparel"
        ? mergeSizeChartRows(updatedList, f.specs?.size_chart || [], newModifiers)
        : f.specs?.size_chart;

      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: updatedList,
          price_modifiers: newModifiers,
          ...(categoryKey === "allowed_sizes" && preset?.key === "apparel" ? { size_chart: nextSizeChart } : {}),
        }
      };
    });
  };

  const handleModifierChange = (optionName, value) => {
    setForm((f) => ({
      ...f,
      specs: {
        ...(f.specs || {}),
        price_modifiers: {
          ...(f.specs?.price_modifiers || {}),
          [optionName]: value
        }
      }
    }));
  };

  const isService = form.item_type === "service";
  const categorySizePreset = getCategorySizePreset(form.name, form.category);
  const isApparel = categorySizePreset?.key === "apparel" || (!form.category && /\b(?:t[\s-]?shirt|tee|polo|shirt|cloth|clothing|textile|fabric|apparel)\b/i.test(form.name));
  const categoryOptionConfig = getCategoryOptionConfig(categorySizePreset?.key || (isApparel ? "apparel" : "paper"));
  const hasConfigurableOptions = isService || isApparel || Boolean(categorySizePreset);

  const setDefaultSpec = (key, value) => {
    setForm((f) => ({
      ...f,
      specs: {
        ...(f.specs || {}),
        [key]: value,
      },
    }));
  };

  const updateSizeChartRow = (index, key, value) => {
    setForm((f) => {
      const chart = [...(f.specs?.size_chart || [])];
      const previous = chart[index] || {};
      chart[index] = { ...previous, [key]: value };
      const modifiers = { ...(f.specs?.price_modifiers || {}) };
      const nextSpecs = { ...(f.specs || {}), size_chart: chart, price_modifiers: modifiers };
      if (key === "size") {
        const previousSize = String(previous.size || "").trim();
        const nextSize = String(value || "").trim();
        if (previousSize) delete modifiers[previousSize];
        if (nextSize) modifiers[nextSize] = previous.price_modifier || "0";

        const nextAllowedSizes = (f.specs?.allowed_sizes || []).filter((size) => size !== previousSize);
        if (nextSize && !nextAllowedSizes.includes(nextSize)) nextAllowedSizes.push(nextSize);
        nextSpecs.allowed_sizes = nextAllowedSizes;
        if (f.specs?.default_size === previousSize) nextSpecs.default_size = nextSize || nextAllowedSizes[0] || "";
      }
      if (key === "price_modifier" && chart[index].size) {
        modifiers[chart[index].size] = value;
      }
      return { ...f, specs: nextSpecs };
    });
  };

  const handleCategoryRequest = async () => {
    const categoryName = categoryRequestName.trim();
    if (categoryName.length < 2) {
      setCategoryNotice({ type: "error", message: "Enter the name of the category you want Admin to review." });
      return;
    }
    if (SERVICE_CATEGORY_NAMES.some((name) => name.toLowerCase() === categoryName.toLowerCase())) {
      setCategoryNotice({ type: "error", message: "That category is already available above. Choose it from the list." });
      return;
    }
    if (!businessId) {
      setCategoryNotice({ type: "error", message: "No active shop profile found. Save your shop profile first." });
      return;
    }

    setCategoryRequestLoading(true);
    setCategoryNotice(null);
    try {
      const { data: existingRequest, error: lookupError } = await supabase
        .from("category_approval_requests")
        .select("id")
        .eq("business_id", businessId)
        .ilike("category_name", categoryName)
        .eq("status", "PENDING")
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existingRequest) {
        setCategoryNotice({ type: "success", message: "This category is already waiting for Admin review." });
        return;
      }

      const { error: requestError } = await supabase
        .from("category_approval_requests")
        .insert({
          business_id: businessId,
          category_name: categoryName,
          reason: categoryRequestReason.trim() || null,
          status: "PENDING",
        });
      if (requestError) throw requestError;
      setCategoryRequestName("");
      setCategoryRequestReason("");
      setCategoryNotice({ type: "success", message: "Request sent to Admin. It will not appear as a category until it is reviewed and added to the system." });
    } catch (requestError) {
      setCategoryNotice({ type: "error", message: requestError.message || "Could not send the category request. Please try again." });
    } finally {
      setCategoryRequestLoading(false);
    }
  };

  const addSizeChartRow = () => {
    setForm((f) => ({
      ...f,
      specs: {
        ...(f.specs || {}),
        size_chart: [
          ...(f.specs?.size_chart || []),
          { size: "", chest_width: "", body_length: "", fits_chest: "", price_modifier: "0" },
        ],
      },
    }));
  };

  const applyTshirtSizeChart = () => {
    setForm((f) => {
      const currentSizes = f.specs?.allowed_sizes || [];
      const customSizes = currentSizes.filter((size) => !SIZE_PRESETS.includes(size));
      const nextSizes = [...TSHIRT_SIZE_CHART.map((row) => row.size), ...customSizes]
        .filter((size, index, list) => list.indexOf(size) === index);
      const modifiers = { ...(f.specs?.price_modifiers || {}) };
      TSHIRT_SIZE_CHART.forEach((row) => { modifiers[row.size] = row.price_modifier; });
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          allowed_sizes: nextSizes,
          size_chart: mergeSizeChartRows(nextSizes, f.specs?.size_chart || [], modifiers),
          price_modifiers: modifiers,
          default_size: f.specs?.default_size || "S",
        },
      };
    });
  };

  const addCalculatedSizePreset = () => {
    const width = Number.parseFloat(customSize.width);
    const height = Number.parseFloat(customSize.height);
    const price = Number.parseFloat(customSize.price);
    if (!customSize.label.trim() || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(price) || price < 0) {
      setError("Enter a preset label, valid width, height, and add-on price.");
      return;
    }

    const label = `${customSize.label.trim()} (${width} x ${height} ${customSize.unit})`;
    const modifier = Number(price.toFixed(2));

    setForm((f) => {
      const sizes = f.specs?.allowed_sizes || [];
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          allowed_sizes: sizes.includes(label) ? sizes : [...sizes, label],
          default_size: f.specs?.default_size || label,
          price_modifiers: {
            ...(f.specs?.price_modifiers || {}),
            [label]: modifier,
          },
          size_price_calculator: {
            unit: customSize.unit,
            last_width: width,
            last_height: height,
            last_price: price,
          },
        },
      };
    });

    setCustomSize({ label: "", width: "", height: "", unit: customSize.unit, price: customSize.price });
    setError(null);
  };

  const addCustomOption = (categoryKey, draft, resetDraft) => {
    const label = draft.label.trim();
    const modifier = Number.parseFloat(draft.modifier);
    if (!label) {
      setError("Enter a name for the custom option.");
      return;
    }
    if (!Number.isFinite(modifier) || modifier < 0) {
      setError("Enter a valid price modifier of 0 or higher.");
      return;
    }

    setForm((f) => {
      const current = f.specs?.[categoryKey] || [];
      const nextOptions = current.includes(label) ? current : [...current, label];
      const preset = getCategorySizePreset(f.name, f.category);
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: nextOptions,
          price_modifiers: {
            ...(f.specs?.price_modifiers || {}),
            [label]: modifier,
          },
          ...(categoryKey === "allowed_sizes" && preset?.key === "apparel"
            ? { size_chart: mergeSizeChartRows(nextOptions, f.specs?.size_chart || [], { ...(f.specs?.price_modifiers || {}), [label]: modifier }) }
            : {}),
        },
      };
    });

    resetDraft();
    setError(null);
  };

  const removeOption = (categoryKey, optionName) => {
    setForm((f) => {
      const nextModifiers = { ...(f.specs?.price_modifiers || {}) };
      delete nextModifiers[optionName];
      const nextOptions = (f.specs?.[categoryKey] || []).filter((option) => option !== optionName);
      const preset = getCategorySizePreset(f.name, f.category);
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: nextOptions,
          price_modifiers: nextModifiers,
          ...(categoryKey === "allowed_sizes" && preset?.key === "apparel"
            ? { size_chart: mergeSizeChartRows(nextOptions, f.specs?.size_chart || [], nextModifiers) }
            : {}),
          ...(categoryKey === "allowed_sizes" && f.specs?.default_size === optionName ? { default_size: "" } : {}),
          ...(categoryKey === "allowed_materials" && f.specs?.default_material === optionName ? { default_material: "" } : {}),
          ...(categoryKey === "quality_levels" && f.specs?.default_quality === optionName ? { default_quality: "" } : {}),
        },
      };
    });
  };

  const handleImagesSelected = async (files) => {
    const incomingFiles = Array.from(files || []);
    if (incomingFiles.length === 0) return;
    if (incomingFiles.some((file) => !file.type?.startsWith("image/"))) {
      setError("Choose JPG, PNG, or WebP images only.");
      return;
    }

    const remainingSlots = Math.max(0, MAX_PRODUCT_IMAGES - (form.imageGallery || []).length);
    if (remainingSlots === 0) {
      setError(`You can add up to ${MAX_PRODUCT_IMAGES} product images.`);
      return;
    }

    try {
      const preparedImages = await Promise.all(incomingFiles.slice(0, remainingSlots).map(async (file) => {
        const optimized = await optimizeImageForUpload(file);
        return { url: URL.createObjectURL(optimized), file: optimized };
      }));
      setForm((current) => ({
        ...current,
        imageGallery: [...(current.imageGallery || []), ...preparedImages].slice(0, MAX_PRODUCT_IMAGES),
        removeImage: false,
      }));
      setError(null);
    } catch (optimizationError) {
      setError(optimizationError.message || "Could not optimize the product images.");
    }
  };

  const removeGalleryImage = (index) => {
    setForm((current) => {
      const imageGallery = (current.imageGallery || []).filter((_, imageIndex) => imageIndex !== index);
      return {
        ...current,
        imageGallery,
        imageUrl: imageGallery[0]?.url || null,
        removeImage: imageGallery.length === 0,
      };
    });
  };

  const addVariant = () => {
    setForm((current) => ({
      ...current,
      specs: {
        ...(current.specs || {}),
        variants: [
          ...(current.specs?.variants || []),
          {
            id: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: "",
            sku: "",
            price: current.price || "0",
            stock_qty: "0",
          },
        ].slice(0, MAX_PRODUCT_VARIANTS),
      },
    }));
  };

  const removeSizeChartRow = (index) => {
    setForm((f) => {
      const chart = [...(f.specs?.size_chart || [])];
      const removedSize = String(chart[index]?.size || "").trim();
      const nextChart = chart.filter((_, rowIndex) => rowIndex !== index);
      const nextModifiers = { ...(f.specs?.price_modifiers || {}) };
      if (removedSize) delete nextModifiers[removedSize];
      const nextAllowedSizes = (f.specs?.allowed_sizes || []).filter((size) => size !== removedSize);
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          allowed_sizes: nextAllowedSizes,
          default_size: f.specs?.default_size === removedSize ? (nextAllowedSizes[0] || "") : f.specs?.default_size,
          size_chart: nextChart,
          price_modifiers: nextModifiers,
        },
      };
    });
  };

  const updateVariant = (variantId, key, value) => {
    setForm((current) => ({
      ...current,
      specs: {
        ...(current.specs || {}),
        variants: (current.specs?.variants || []).map((variant) => (
          variant.id === variantId ? { ...variant, [key]: value } : variant
        )),
      },
    }));
  };

  const removeVariant = (variantId) => {
    setForm((current) => ({
      ...current,
      specs: {
        ...(current.specs || {}),
        variants: (current.specs?.variants || []).filter((variant) => variant.id !== variantId),
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Item name is required.");
    if (!form.category) return setError("Please choose a category.");
    
    const parsedPrice = parseFloat(form.price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return setError("Please enter a valid price (₱0 or higher).");
    }

    setSaving(true);
    setError(null);

    try {
      const productVariants = isService ? [] : (form.specs?.variants || []);
      if (productVariants.some((variant) => !String(variant.name || "").trim())) {
        throw new Error("Give every product variant a name or remove the empty variant.");
      }
      if (productVariants.some((variant) => !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0 || !Number.isInteger(Number(variant.stock_qty)) || Number(variant.stock_qty) < 0)) {
        throw new Error("Each product variant needs a valid price and whole-number stock quantity.");
      }

      const imageGallery = form.removeImage ? [] : (form.imageGallery || []);
      let currentUser = null;
      if (imageGallery.some((image) => image.file)) {
        const { data: authData } = await supabase.auth.getUser();
        currentUser = authData?.user || null;
        if (!currentUser || !businessId) throw new Error("Your owner session expired. Please sign in again.");
      }

      const finalImageUrls = [];
      for (const image of imageGallery) {
        if (!image.file) {
          if (image.url && !image.url.startsWith("blob:")) finalImageUrls.push(image.url);
          continue;
        }
        const fileExt = getUploadExtension(image.file);
        const filePath = `services/${businessId}/${currentUser.id}-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, image.file, {
          cacheControl: "31536000",
          contentType: image.file.type,
        });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
        finalImageUrls.push(publicUrl);
      }

      const cleanModifiers = {};
      Object.entries(form.specs?.price_modifiers || {}).forEach(([k, v]) => {
        cleanModifiers[k] = parseFloat(v) || 0;
      });
      const cleanSizeChart = (form.specs?.size_chart || [])
        .map((row) => ({
          size: String(row.size || "").trim(),
          chest_width: String(row.chest_width || "").trim(),
          body_length: String(row.body_length || "").trim(),
          fits_chest: String(row.fits_chest || "").trim(),
          price_modifier: Number.parseFloat(row.price_modifier) || 0,
        }))
        .filter((row) => row.size);
      cleanSizeChart.forEach((row) => { cleanModifiers[row.size] = row.price_modifier; });

      const cleanVariants = productVariants
        .map((variant, index) => ({
          id: String(variant.id || `variant-${index + 1}`),
          name: String(variant.name || "").trim(),
          sku: String(variant.sku || "").trim() || null,
          price: Number(Number(variant.price).toFixed(2)),
          stock_qty: Number.parseInt(variant.stock_qty, 10),
        }))
        .filter((variant) => variant.name);
      const variantStockTotal = cleanVariants.reduce((total, variant) => total + variant.stock_qty, 0);

      const finalSpecs = {
        ...form.specs,
        price_modifiers: cleanModifiers,
        size_chart: cleanSizeChart,
        image_urls: finalImageUrls,
        variants: cleanVariants,
        is_customizable: isService ? form.is_customizable : false
      };

      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        price: parsedPrice,
        price_max: isService && form.price_max ? (parseFloat(form.price_max) || null) : null,
        category: normalizeServiceCategory(form.category, `${form.name} ${form.description}`),
        item_type: form.item_type,
        available: form.available,
        image_url: form.removeImage ? null : (finalImageUrls[0] || null),
        stock_qty: cleanVariants.length > 0 ? variantStockTotal : Math.max(0, Number.parseInt(form.stock_qty || "0", 10)),
        low_stock_threshold: Math.max(0, Number.parseInt(form.low_stock_threshold || "10", 10)),
        is_customizable: isService ? form.is_customizable : false,
        specs_json: finalSpecs,
      });

      onClose();
    } catch (err) {
      console.error("Save error:", err);
      const errMsg = typeof err === "string" ? err : (err?.message || err?.details || err?.hint || "Failed to save printing item.");
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const selectedSizes = form.specs?.allowed_sizes || [];
  const customSizes = selectedSizes.filter((size) => !SIZE_PRESETS.includes(size));
  const selectedNonSizeOptions = [
    ...(form.specs?.allowed_materials || []),
    ...(form.specs?.quality_levels || [])
  ];
  const allCategorySizesSelected = Boolean(categorySizePreset?.options.length) && categorySizePreset.options.every((size) => selectedSizes.includes(size));
  const showSizeSection = hasConfigurableOptions && !isApparel;
  const showCustomerOptions = hasConfigurableOptions && (isService || isApparel || selectedNonSizeOptions.length > 0);
  const progressSteps = [
    { key: "details", label: "Details", hint: "Name, category, image" },
    ...(showSizeSection ? [{ key: "sizes", label: "Sizes", hint: "Only the sizes you offer" }] : []),
    { key: "price", label: "Price & stock", hint: "Base price and inventory" },
    ...(showCustomerOptions ? [{
      key: "options",
      label: isApparel ? "Sizes & options" : "Extras",
      hint: isApparel ? "Clothing sizes, materials, quality" : "Materials and quality",
    }] : []),
  ];
  const stepNumber = (key) => progressSteps.findIndex((step) => step.key === key) + 1;

  return (
    <div className={embedded ? "w-full" : "dialog-overlay"} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} onClick={embedded ? undefined : onClose}>
      <div className={embedded ? "w-full" : "dialog-surface max-w-2xl w-full max-h-[92vh] overflow-y-auto"} onClick={(e) => e.stopPropagation()}>
        {!embedded && (
          <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="font-bold text-base text-slate-900">
              {mode === "create" ? `Add New ${isService ? "Service" : "Product"}` : `Edit ${isService ? "Service" : "Product"}`}
            </h2>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`${embedded ? "p-4 sm:p-7 lg:p-8" : "p-6"} space-y-6`}>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Form sections">
            {progressSteps.map((step, index) => (
              <div key={step.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-slate-900">{step.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{step.hint}</span>
                </span>
                <CheckCircle2 size={15} className="ml-auto shrink-0 text-slate-300" />
              </div>
            ))}
          </div>

          <div id="basic-details" className="scroll-mt-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">{stepNumber("details")}</span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Item details</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">{isService ? "Name it clearly, choose its category, and explain what customers will receive." : "Name it clearly, choose its category, and add a useful product image."}</p>
            </div>
          </div>

          {/* Item Type Switcher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">What are you adding?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => set("item_type", "service")}
                className={`py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  isService ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Custom service
              </button>
              <button
                type="button"
                onClick={() => set("item_type", "product")}
                className={`py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  !isService ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Ready-made product
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {isService ? "★ Made-to-order custom printing with an optional available quantity or capacity." : "★ Ready-made physical store product with inventory deducted after checkout."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Item Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. 350gsm Matte Business Cards"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#00FFFF]"
            />
          </div>

          {!isService && (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold text-slate-700">Product images</label>
                <span className="text-[10px] font-semibold text-slate-400">Up to {MAX_PRODUCT_IMAGES} · first image is the cover</span>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(form.imageGallery || []).map((image, index) => (
                    <div key={`${image.url}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <img src={image.url} alt={`Product image ${index + 1}`} className="h-full w-full object-cover" />
                      {index === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/85 px-1.5 py-1 text-[9px] font-black text-white">COVER</span>}
                      <button type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remove product image ${index + 1}`} className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-rose-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  {(form.imageGallery || []).length === 0 && (
                    <div className="col-span-2 flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-400 sm:col-span-4 sm:aspect-[4/1]">
                      <ImageOff size={28} />
                      <span className="text-[11px] font-semibold">No images yet</span>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">Add several product photos like a storefront gallery. Customers can browse them before choosing a variant.</p>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => { void handleImagesSelected(event.target.files); event.target.value = ""; }}
                    className="w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#EC008C]"
                  />
                </div>
              </div>
            </div>
          )}

          {!isService && (
            <div className="rounded-2xl border-2 border-[#EC008C]/20 bg-[#FFF8FC] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers size={17} className="text-[#EC008C]" />
                    <h3 className="text-sm font-black text-slate-900">Product variants</h3>
                  </div>
                  <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-500">Add options such as color, size, finish, or bundle. Each variant can have its own price, SKU, and stock quantity.</p>
                </div>
                <button type="button" onClick={addVariant} disabled={(form.specs?.variants || []).length >= MAX_PRODUCT_VARIANTS} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-black text-white hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40"><Plus size={13} /> Add variant</button>
              </div>

              {(form.specs?.variants || []).length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#EC008C]/30 bg-white p-3 text-[11px] text-slate-500">No variants yet. The product will use the base price and stock below.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {(form.specs?.variants || []).map((variant, index) => (
                    <div key={variant.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Variant {index + 1}</span>
                        <button type="button" onClick={() => removeVariant(variant.id)} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700"><Trash2 size={12} /> Remove</button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input type="text" value={variant.name} onChange={(event) => updateVariant(variant.id, "name", event.target.value)} placeholder="e.g. Red · Large" aria-label={`Variant ${index + 1} name`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold outline-none focus:border-[#EC008C] sm:col-span-2" />
                        <input type="text" value={variant.sku} onChange={(event) => updateVariant(variant.id, "sku", event.target.value)} placeholder="SKU (optional)" aria-label={`Variant ${index + 1} SKU`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#EC008C]" />
                        <input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(variant.id, "price", event.target.value)} placeholder="Price" aria-label={`Variant ${index + 1} price`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-[#EC008C]" />
                        <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 sm:col-span-2"><span className="shrink-0">Stock</span><input type="number" min="0" step="1" value={variant.stock_qty} onChange={(event) => updateVariant(variant.id, "stock_qty", event.target.value)} aria-label={`Variant ${index + 1} stock`} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-[#EC008C]" /></label>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] font-semibold text-slate-500">Variant stock is counted into the product total automatically when you save.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              placeholder="Describe paper finish, turnaround speed, or custom options..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Printing category</label>
            <select
              value={form.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            >
              <option value="">Choose the closest printing type</option>
              {SERVICE_CATEGORY_NAMES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Choose the closest match. Older or unmatched categories are automatically moved to the closest approved printing type.</p>
            {form.category && (
              <div className="mt-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-[11px] text-slate-600">
                <p className="font-semibold text-slate-800">{SERVICE_CATEGORIES.find((category) => category.name === form.category)?.description}</p>
                <p className="mt-1"><strong className="text-slate-800">Best for:</strong> {SERVICE_CATEGORIES.find((category) => category.name === form.category)?.examples}</p>
              </div>
            )}
            <details className="mt-3 rounded-xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold text-slate-700">View all category descriptions</summary>
              <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                {SERVICE_CATEGORIES.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => handleCategoryChange(category.name)}
                    className={`rounded-lg border p-2 text-left transition-colors ${form.category === category.name ? "border-[#00AFC0] bg-cyan-50" : "border-slate-100 bg-slate-50 hover:border-cyan-200 hover:bg-cyan-50/50"}`}
                  >
                    <span className="block text-[11px] font-black text-slate-800">{category.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{category.description}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-[#008F91]">{category.examples}</span>
                  </button>
                ))}
              </div>
            </details>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold text-amber-900">Need a category that is not listed?</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/75">Send a request to Admin. This only creates a review request; it will not add or publish a new category automatically.</p>
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
                {categoryNotice && (
                  <p className={`text-[11px] font-semibold ${categoryNotice.type === "error" ? "text-rose-700" : "text-emerald-700"}`} role="status">
                    {categoryNotice.message}
                  </p>
                )}
                <input
                  type="text"
                  value={categoryRequestName}
                  onChange={(event) => setCategoryRequestName(event.target.value)}
                  placeholder="New category name"
                  maxLength={80}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-amber-400"
                />
                <textarea
                  value={categoryRequestReason}
                  onChange={(event) => setCategoryRequestReason(event.target.value)}
                  rows={2}
                  placeholder="What should customers order under this category? (optional)"
                  maxLength={500}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleCategoryRequest}
                  disabled={categoryRequestLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-[#EC008C] disabled:cursor-wait disabled:opacity-50"
                >
                  {categoryRequestLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {categoryRequestLoading ? "Sending request..." : "Send request to Admin"}
                </button>
              </div>
            </div>
          </div>

          {showSizeSection && (
            <div id="category-size-selection" className="scroll-mt-6 rounded-2xl border-2 border-[#00AFC0]/30 bg-[#F3FFFF] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#00AFC0] text-xs font-black text-white">{stepNumber("sizes")}</span>
                    <p className="text-sm font-black text-slate-900">Choose available sizes</p>
                  </div>
                  <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-slate-500">
                    {categorySizePreset
                      ? `Only the ${categorySizePreset.label.toLowerCase()} for this category are shown. Check every size customers can order.`
                      : "Choose a category above to show its size list, or add a custom size if this category uses a different measurement."}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-[#009FA0] ring-1 ring-cyan-200">{selectedSizes.length} selected</span>
              </div>

              {categorySizePreset ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-slate-700">{categorySizePreset.label}</p>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        specs: {
                          ...(f.specs || {}),
                          allowed_sizes: allCategorySizesSelected
                            ? customSizes
                            : [...customSizes, ...categorySizePreset.options.filter((size) => !customSizes.includes(size))],
                          default_size: allCategorySizesSelected ? (customSizes[0] || "") : (f.specs?.default_size || categorySizePreset.options[0]),
                        },
                      }))}
                      className="text-[10px] font-black text-[#009FA0] hover:text-[#EC008C]"
                    >
                      {allCategorySizesSelected ? "Clear standard sizes" : "Select all standard sizes"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {categorySizePreset.options.map((size) => {
                      const checked = selectedSizes.includes(size);
                      return (
                        <div key={`category-size-${size}`} className={`rounded-xl border bg-white p-3 transition-colors ${checked ? "border-[#00AFC0] shadow-sm" : "border-slate-200 hover:border-cyan-300"}`}>
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOption("allowed_sizes", size)}
                              className="h-4 w-4 rounded border-slate-300 text-[#EC008C] focus:ring-[#EC008C]"
                            />
                            <span className="min-w-0 flex-1">{size}</span>
                            {checked && <CheckCircle2 size={14} className="shrink-0 text-[#00AFC0]" />}
                          </label>
                          {checked && !isApparel && (
                            <label className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
                              <span className="shrink-0">Add-on ₱</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.specs?.price_modifiers?.[size] ?? ""}
                                onChange={(e) => handleModifierChange(size, e.target.value)}
                                placeholder="0"
                                aria-label={`Add-on PHP for ${size}`}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-[11px] font-bold text-slate-800 outline-none focus:border-[#00AFC0]"
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-cyan-300 bg-white p-3 text-[11px] leading-relaxed text-slate-500">No standard sizes are assigned to this category yet. Use the custom size option below.</div>
              )}

              {customSizes.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Custom sizes</p>
                  <div className="mt-2 space-y-2">
                    {customSizes.map((size) => (
                      <div key={size} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                        <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-700">{size}</span>
                        <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                          <span>Add-on PHP</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.specs?.price_modifiers?.[size] ?? "0"}
                            onChange={(e) => handleModifierChange(size, e.target.value)}
                            aria-label={`Add-on PHP for ${size}`}
                            className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[10px] font-bold text-slate-800 outline-none focus:border-[#00AFC0]"
                          />
                        </label>
                        <button type="button" onClick={() => removeOption("allowed_sizes", size)} className="shrink-0 text-slate-400 hover:text-rose-600" aria-label={`Remove ${size}`}><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details className="mt-3 rounded-xl border border-cyan-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-[11px] font-black text-slate-800">
                  <span className="flex items-center gap-2"><Calculator size={14} className="text-[#009FA0]" /> Add a custom size</span>
                  <span className="text-[10px] font-semibold text-slate-400">Size details + add-on price</span>
                </summary>
                <div className="grid grid-cols-2 gap-2 border-t border-cyan-100 p-3 sm:grid-cols-5">
                  <input type="text" value={customSize.label} onChange={(e) => setCustomSize((p) => ({ ...p, label: e.target.value }))} placeholder="Label" className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0] sm:col-span-1" />
                  <input type="number" min="0" step="0.01" value={customSize.width} onChange={(e) => setCustomSize((p) => ({ ...p, width: e.target.value }))} placeholder="Width" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
                  <input type="number" min="0" step="0.01" value={customSize.height} onChange={(e) => setCustomSize((p) => ({ ...p, height: e.target.value }))} placeholder="Height" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
                  <select value={customSize.unit} onChange={(e) => setCustomSize((p) => ({ ...p, unit: e.target.value }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]"><option value="in">in</option><option value="ft">ft</option><option value="cm">cm</option></select>
                  <input type="number" min="0" step="0.01" value={customSize.price} onChange={(e) => setCustomSize((p) => ({ ...p, price: e.target.value }))} placeholder="Add-on price" aria-label="Add-on price" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
                  <button type="button" onClick={addCalculatedSizePreset} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-[#EC008C] sm:col-span-1"><Plus size={13} /> Add size</button>
                </div>
              </details>

              {selectedSizes.length > 0 && (
                <label className="mt-3 block max-w-sm text-[10px] font-bold text-slate-600">
                  Default size
                  <select value={form.specs?.default_size || ""} onChange={(e) => setDefaultSpec("default_size", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-[#00AFC0]">
                    <option value="">Select default size</option>
                    {selectedSizes.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              )}
              <p className="mt-3 text-[10px] text-slate-500">
                {isApparel
                  ? "The checked clothing sizes are listed above. Set their add-on prices in the pink size chart below."
                  : "The checked sizes and add-on prices are shown to customers on the order form."}
              </p>
            </div>
          )}

            </div>

          <div id="pricing-inventory" className="scroll-mt-6 space-y-5 border-t border-[#D8D6CE] pt-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">{stepNumber("price")}</span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Price & inventory</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Set the starting price and the available quantity or capacity for this item.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isService ? "Base Price (₱)" : "Selling Price (₱)"}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
              />
            </div>
            {isService && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Price Range (₱ optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price_max}
                  onChange={(e) => set("price_max", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                />
              </div>
            )}
          </div>

          {/* Quantity / Inventory Settings */}
          {
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">{isService ? "Available Service Quantity" : "Physical Stock Inventory Control"}</span>
                <ShieldAlert size={16} className="text-amber-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">{isService ? "Available Quantity / Capacity" : "Current Stock Quantity"}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_qty}
                    onChange={(e) => set("stock_qty", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">Low Stock Warning Limit</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.low_stock_threshold}
                    onChange={(e) => set("low_stock_threshold", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold outline-none"
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-amber-800">Set this to 0 when the item has no fixed quantity limit. Products deduct stock after checkout; service quantities help you track available capacity while you review the customer quote.</p>
            </div>
          }
            </div>

          {/* Printable Options & Spec Modifiers for Services */}
          {showCustomerOptions && (
            <div id="customer-options" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">{stepNumber("options")}</span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-black text-slate-900"><Sparkles size={15} className="text-[#EC008C]" /> Other customer choices</p>
                    <p className="mt-1 text-[10px] text-slate-500">Optional {categoryOptionConfig.materialLabel.toLowerCase()} and {categoryOptionConfig.qualityLabel.toLowerCase()}. {isApparel ? "Clothing sizes are configured once in the chart below." : "Sizes are configured above."}</p>
                  </div>
                </div>
                {isService && (
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_customizable}
                      onChange={(e) => set("is_customizable", e.target.checked)}
                      className="rounded text-[#EC008C] focus:ring-[#EC008C]"
                    />
                    Allow artwork / specification notes
                  </label>
                )}
              </div>

              {isApparel && (
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-900">Available clothing sizes</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Add each size once. The rows below control what customers can order and any size add-on price.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#C40075] ring-1 ring-fuchsia-200">{(form.specs?.allowed_sizes || []).length} selected</span>
                      <button type="button" onClick={applyTshirtSizeChart} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white hover:bg-[#EC008C]">
                        Use all standard sizes
                      </button>
                    </div>
                  </div>
                  {(form.specs?.size_chart || []).length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-fuchsia-200 bg-white">
                      <table className="min-w-[680px] w-full text-left text-[10px]">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="px-2 py-2">Size</th>
                            <th className="px-2 py-2">Chest width</th>
                            <th className="px-2 py-2">Body length</th>
                            <th className="px-2 py-2">Fits chest</th>
                            <th className="px-2 py-2">Add-on PHP</th>
                            <th className="px-2 py-2" aria-label="Remove row" />
                          </tr>
                        </thead>
                        <tbody>
                          {(form.specs?.size_chart || []).map((row, index) => (
                            <tr key={`size-chart-${index}`} className="border-t border-slate-100">
                              {[["size", "S"], ["chest_width", "45–48 cm"], ["body_length", "68–71 cm"], ["fits_chest", "86–91 cm"], ["price_modifier", "0"]].map(([key, placeholder]) => (
                                <td key={key} className="px-2 py-2">
                                  <input
                                    type={key === "price_modifier" ? "number" : "text"}
                                    min={key === "price_modifier" ? "0" : undefined}
                                    step={key === "price_modifier" ? "0.01" : undefined}
                                    value={row[key] ?? ""}
                                    onChange={(event) => updateSizeChartRow(index, key, event.target.value)}
                                    placeholder={placeholder}
                                    aria-label={key === "price_modifier" ? `Add-on PHP for ${row.size || `row ${index + 1}`}` : `${key.replaceAll("_", " ")} for ${row.size || `row ${index + 1}`}`}
                                    className="w-full min-w-24 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] outline-none focus:border-[#EC008C]"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center">
                                  <button type="button" onClick={() => removeSizeChartRow(index)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove size row ${index + 1}`}>
                                    <Trash2 size={13} />
                                  </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-fuchsia-200 bg-white p-3 text-[10px] leading-relaxed text-slate-500">
                      No clothing sizes yet. Use all standard sizes or add a custom row below.
                    </div>
                  )}
                  <button type="button" onClick={addSizeChartRow} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 hover:border-[#EC008C] hover:text-[#EC008C]"><Plus size={13} /> Add size row</button>
                  {(form.specs?.allowed_sizes || []).length > 0 && (
                    <label className="block max-w-sm text-[10px] font-bold text-slate-600">
                      Default size
                      <select value={form.specs?.default_size || ""} onChange={(event) => setDefaultSpec("default_size", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-[#EC008C]">
                        <option value="">Select default size</option>
                        {(form.specs?.allowed_sizes || []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {/* Materials Selection */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">{categoryOptionConfig.materialLabel}</span>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptionConfig.materials.map((mat) => {
                    const isChecked = (form.specs?.allowed_materials || []).includes(mat);
                    return (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => toggleOption("allowed_materials", mat)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          isChecked ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {mat}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
                  <input
                    type="text"
                    value={customMaterial.label}
                    onChange={(e) => setCustomMaterial((p) => ({ ...p, label: e.target.value }))}
                    placeholder={`Custom ${categoryOptionConfig.materialLabel.toLowerCase()}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00FFFF]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customMaterial.modifier}
                    onChange={(e) => setCustomMaterial((p) => ({ ...p, modifier: e.target.value }))}
                    placeholder="+ PHP"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00FFFF]"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomOption("allowed_materials", customMaterial, () => setCustomMaterial({ label: "", modifier: "" }))}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#1A1A1A] px-3 py-2 text-xs font-bold text-white hover:bg-[#EC008C]"
                  >
                    <Plus size={13} /> {categoryOptionConfig.addMaterialLabel}
                  </button>
                </div>
                {(form.specs?.allowed_materials || []).filter((material) => !KNOWN_OPTION_NAMES.has(material)).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(form.specs?.allowed_materials || []).filter((material) => !KNOWN_OPTION_NAMES.has(material)).map((material) => (
                      <span key={material} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-cyan-200">
                        <span className="truncate">{material}</span>
                        <button type="button" onClick={() => removeOption("allowed_materials", material)} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${material}`}>
                          <Trash2 size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality Levels */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">{categoryOptionConfig.qualityLabel}</span>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptionConfig.qualities.map((q) => {
                    const isChecked = (form.specs?.quality_levels || []).includes(q);
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => toggleOption("quality_levels", q)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          isChecked ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto]">
                  <input
                    type="text"
                    value={customQuality.label}
                    onChange={(e) => setCustomQuality((p) => ({ ...p, label: e.target.value }))}
                    placeholder={`Custom ${categoryOptionConfig.qualityLabel.toLowerCase()}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00FFFF]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customQuality.modifier}
                    onChange={(e) => setCustomQuality((p) => ({ ...p, modifier: e.target.value }))}
                    placeholder="+ PHP"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00FFFF]"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomOption("quality_levels", customQuality, () => setCustomQuality({ label: "", modifier: "" }))}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#1A1A1A] px-3 py-2 text-xs font-bold text-white hover:bg-[#EC008C]"
                  >
                    <Plus size={13} /> {categoryOptionConfig.addQualityLabel}
                  </button>
                </div>
                {(form.specs?.quality_levels || []).filter((quality) => !KNOWN_OPTION_NAMES.has(quality)).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(form.specs?.quality_levels || []).filter((quality) => !KNOWN_OPTION_NAMES.has(quality)).map((quality) => (
                      <span key={quality} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-cyan-200">
                        <span className="truncate">{quality}</span>
                        <button type="button" onClick={() => removeOption("quality_levels", quality)} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${quality}`}>
                          <Trash2 size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Default {categoryOptionConfig.materialLabel}</label>
                  <select
                    value={form.specs?.default_material || ""}
                    onChange={(e) => setDefaultSpec("default_material", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                  >
                    <option value="">Select default</option>
                    {(form.specs?.allowed_materials || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Default {categoryOptionConfig.qualityLabel}</label>
                  <select
                    value={form.specs?.default_quality || ""}
                    onChange={(e) => setDefaultSpec("default_quality", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                  >
                    <option value="">Select default</option>
                    {(form.specs?.quality_levels || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </div>

              {/* Price Modifiers (+₱ per option) */}
              {selectedNonSizeOptions.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-900 block">Optional add-on prices</span>
                  <div className="grid grid-cols-1 gap-2 pr-1 sm:grid-cols-2">
                    {selectedNonSizeOptions.map((optName) => (
                      <div key={optName} className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 break-words font-semibold text-slate-800 text-[11px]">{optName}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-slate-400 font-bold">PHP</span>
                          <input
                            type="number"
                            step="1"
                            value={form.specs?.price_modifiers?.[optName] ?? ""}
                            onChange={(e) => handleModifierChange(optName, e.target.value)}
                            placeholder="0"
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isService && !hasConfigurableOptions && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-xs font-bold text-slate-800">This ready-made product uses fixed options.</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Manage its selling price and stock above. Customers will not be asked to choose a print size.</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="sticky bottom-0 z-20 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="hidden rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:inline-flex">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save item
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
