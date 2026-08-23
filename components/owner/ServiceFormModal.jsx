"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, ImagePlus, ImageOff, Layers, Sparkles, Plus, Trash2, ShieldAlert, AlertCircle, Send, Calculator, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import { getCategoryOptionConfig, getKnownOptionNames, normalizeConfiguredOptions } from "@/lib/serviceOptions";

const CATEGORY_GROUPS = {
  "Core Printing Categories": [
    "Digital Printing", "Offset Printing", "Large Format Printing", "Screen Printing", "UV Printing"
  ],
  "Specialty Printing": [
    "Sublimation Printing", "3D Printing", "Textile / Fabric Printing", "Packaging Printing"
  ],
  "Finishing & Post-Press": [
    "Cutting", "Binding", "Lamination", "Folding", "Embossing / Debossing", "Foil Stamping"
  ],
  "Marketing & Business Materials": [
    "Business Cards", "Flyers & Brochures", "Posters", "Banners", "Stickers & Labels"
  ],
  "Custom & Promotional": [
    "T-Shirt Printing", "Mug Printing", "ID Cards", "Giveaways / Souvenirs"
  ]
};

const FLAT_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

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
    categories: ["Digital Printing", "Offset Printing", "Flyers & Brochures"],
    options: ["A4 (8.27\" x 11.69\")", "A3 (11.69\" x 16.54\")", "Letter (8.5\" x 11\")", "Legal (8.5\" x 14\")", "Long Bond (8.5\" x 13\")"],
  },
  {
    key: "business-card",
    label: "Business card sizes",
    categories: ["Business Cards"],
    options: ["Standard Business Card (3.5\" x 2\")"],
  },
  {
    key: "poster",
    label: "Poster sizes",
    categories: ["Posters"],
    options: ["A4 Poster (8.27\" x 11.69\")", "A3 Poster (11.69\" x 16.54\")", "A2 Poster (16.54\" x 23.39\")", "A1 Poster (23.39\" x 33.11\")", "A0 Poster (33.11\" x 46.81\")"],
  },
  {
    key: "apparel",
    label: "Clothing sizes",
    categories: ["Screen Printing", "Textile / Fabric Printing", "T-Shirt Printing"],
    options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  },
  {
    key: "tarpaulin",
    label: "Tarpaulin / banner sizes",
    categories: ["Large Format Printing", "Large Format", "Banners", "Tarpaulin"],
    options: ["2 x 3 ft Banner", "3 x 4 ft Banner", "4 x 6 ft Tarpaulin", "4 x 8 ft Tarpaulin", "5 x 10 ft Tarpaulin"],
  },
  {
    key: "photo",
    label: "ID and photo sizes",
    categories: [],
    options: ["1 x 1 in ID Photo", "2 x 2 in ID Photo", "2 x 3 in ID Photo"],
  },
  {
    key: "id-card",
    label: "ID card sizes",
    categories: ["ID Cards"],
    options: ["Standard ID Card (85.6 x 54 mm)"],
  },
  {
    key: "sticker",
    label: "Sticker / label sizes",
    categories: ["Stickers & Labels"],
    options: ["1 x 1 in Sticker", "2 x 2 in Sticker", "3 x 3 in Sticker", "4 x 6 in Sticker", "A4 Sticker Sheet"],
  },
  {
    key: "mug",
    label: "Mug / tumbler sizes",
    categories: ["Mug Printing"],
    options: ["11 oz Mug", "15 oz Mug", "16 oz Tumbler"],
  },
];
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
const getCategorySizePreset = (name = "", category = "") => {
  const namePresetKey = SIZE_NAME_MATCHERS.find(([, matcher]) => matcher.test(name))?.[0];
  return CATEGORY_SIZE_PRESETS.find((preset) => preset.key === namePresetKey)
    || CATEGORY_SIZE_PRESETS.find((preset) => preset.categories.includes(category))
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
      const initialCategoryPreset = getCategorySizePreset(initialValues.name || "", initialValues.category || "");
      const initialOptionConfig = getCategoryOptionConfig(initialCategoryPreset?.key || "paper");
      const initialAllowedSizes = existingSpecs.allowed_sizes || [];
      const categoryAllowedSizes = initialCategoryPreset
        ? initialAllowedSizes.filter((size) => !SIZE_PRESETS.includes(size) || initialCategoryPreset.options.includes(size))
        : initialAllowedSizes;
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
        category:             initialValues.category || "",
        available:            initialValues.available !== false,
        imageUrl:             initialValues.image_url || null,
        imageFile:            null,
        removeImage:          false,
        stock_qty:            initialValues.stock_qty != null ? String(initialValues.stock_qty) : "0",
        low_stock_threshold: initialValues.low_stock_threshold != null ? String(initialValues.low_stock_threshold) : "10",
        is_customizable:      initialValues.is_customizable !== false,
        specs: {
          allowed_sizes:     categoryAllowedSizes,
          allowed_materials: initialMaterials,
          quality_levels:    initialQualities,
          price_modifiers:   existingSpecs.price_modifiers || {},
          default_size:      categoryAllowedSizes.includes(existingSpecs.default_size) ? existingSpecs.default_size : null,
          default_material:  initialMaterials.includes(existingSpecs.default_material) ? existingSpecs.default_material : (initialMaterials[0] || null),
          default_quality:   initialQualities.includes(existingSpecs.default_quality) ? existingSpecs.default_quality : (initialQualities[0] || null),
          size_chart:        Array.isArray(existingSpecs.size_chart) ? existingSpecs.size_chart : [],
          is_customizable:   existingSpecs.is_customizable !== false,
        }
      };
    }
    return defaultType === "product" ? { ...EMPTY_PRODUCT } : { ...EMPTY_SERVICE };
  });

  const [imagePreview, setImagePreview] = useState(initialValues?.image_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [categoryRequestName, setCategoryRequestName] = useState("");
  const [categoryRequestReason, setCategoryRequestReason] = useState("");
  const [categoryRequestLoading, setCategoryRequestLoading] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState(null);
  const [customSize, setCustomSize] = useState({ label: "", width: "", height: "", unit: "in", rate: "" });
  const [customMaterial, setCustomMaterial] = useState({ label: "", modifier: "" });
  const [customQuality, setCustomQuality] = useState({ label: "", modifier: "" });
  const [showCategoryRequest, setShowCategoryRequest] = useState(false);

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
      if (key === "size") {
        if (previous.size) delete modifiers[previous.size];
        if (value.trim()) modifiers[value.trim()] = previous.price_modifier || "0";
      }
      if (key === "price_modifier" && chart[index].size) {
        modifiers[chart[index].size] = value;
      }
      return { ...f, specs: { ...(f.specs || {}), size_chart: chart, price_modifiers: modifiers } };
    });
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
      const modifiers = { ...(f.specs?.price_modifiers || {}) };
      TSHIRT_SIZE_CHART.forEach((row) => { modifiers[row.size] = row.price_modifier; });
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          allowed_sizes: [...currentSizes, ...TSHIRT_SIZE_CHART.map((row) => row.size)].filter((size, index, list) => list.indexOf(size) === index),
          size_chart: TSHIRT_SIZE_CHART.map((row) => ({ ...row })),
          price_modifiers: modifiers,
          default_size: f.specs?.default_size || "S",
        },
      };
    });
  };

  const addCalculatedSizePreset = () => {
    const width = Number.parseFloat(customSize.width);
    const height = Number.parseFloat(customSize.height);
    const rate = Number.parseFloat(customSize.rate);
    if (!customSize.label.trim() || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(rate) || rate < 0) {
      setError("Enter a preset label, valid width, height, and price per area.");
      return;
    }

    const label = `${customSize.label.trim()} (${width} x ${height} ${customSize.unit})`;
    const modifier = Number((width * height * rate).toFixed(2));

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
            last_rate: rate,
          },
        },
      };
    });

    setCustomSize({ label: "", width: "", height: "", unit: customSize.unit, rate: customSize.rate });
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

  const handleCategoryRequest = async () => {
    const categoryName = categoryRequestName.trim();
    if (!categoryName) {
      setCategoryNotice({ type: "error", message: "Enter the category name you want admin to review." });
      return;
    }
    if (!businessId) {
      setCategoryNotice({ type: "error", message: "No active shop profile found for this category request." });
      return;
    }

    setCategoryRequestLoading(true);
    setCategoryNotice(null);
    try {
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
      setCategoryNotice({ type: "success", message: "Category request sent to admin for approval." });
    } catch (err) {
      setCategoryNotice({
        type: "error",
        message: err.message || "Could not submit the category request. Check that the category approval table and policies are installed.",
      });
    } finally {
      setCategoryRequestLoading(false);
    }
  };

  const handleImageSelected = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    try {
      const optimized = await optimizeImageForUpload(file);
      set("imageFile", optimized);
      set("removeImage", false);
      setImagePreview(URL.createObjectURL(optimized));
      setError(null);
    } catch (optimizationError) {
      setError(optimizationError.message || "Could not optimize this image.");
    }
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
      let finalImageUrl = form.imageUrl;
      if (form.imageFile) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser || !businessId) throw new Error("Your owner session expired. Please sign in again.");
        const optimized = await optimizeImageForUpload(form.imageFile);
        const fileExt = getUploadExtension(optimized);
        const filePath = `services/${businessId}/${currentUser.id}-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, optimized, {
          cacheControl: "31536000",
          contentType: optimized.type,
        });
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
        finalImageUrl = publicUrl;
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

      const finalSpecs = {
        ...form.specs,
        price_modifiers: cleanModifiers,
        size_chart: cleanSizeChart,
        is_customizable: isService ? form.is_customizable : false
      };

      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        price: parsedPrice,
        price_max: isService && form.price_max ? (parseFloat(form.price_max) || null) : null,
        category: form.category || "General Printing",
        item_type: form.item_type,
        available: form.available,
        image_url: form.removeImage ? null : finalImageUrl,
        stock_qty: isService ? 0 : Number.parseInt(form.stock_qty || "0", 10),
        low_stock_threshold: isService ? 10 : Number.parseInt(form.low_stock_threshold || "10", 10),
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

          <div id="basic-details" className="scroll-mt-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">1</span>
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
              {isService ? "★ Made-to-order custom printing (no inventory stock required)." : "★ Ready-made physical store product (inventory stock is automatically decremented on order)."}
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
                <label className="block text-xs font-semibold text-slate-700">Product image</label>
                <span className="text-[10px] font-semibold text-slate-400">Auto-compressed · 5MB max</span>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-44 sm:w-44">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ImageOff size={32} />
                      <span className="text-[11px] font-semibold">No image yet</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">Add a clear photo so customers can recognize this ready-to-sell product.</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleImageSelected(event.target.files?.[0])}
                    className="w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#EC008C]"
                  />
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => {
                        set("imageFile", null);
                        set("imageUrl", null);
                        set("removeImage", true);
                        setImagePreview(null);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 size={12} /> Remove image
                    </button>
                  )}
                </div>
              </div>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            >
              <option value="">Select Category</option>
              {form.category && !FLAT_CATEGORIES.includes(form.category) && (
                <option value={form.category}>{form.category} (current)</option>
              )}
              {FLAT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Use an approved category. New categories need admin approval before they appear in the list.</p>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <button type="button" onClick={() => setShowCategoryRequest((open) => !open)} className="flex w-full items-center justify-between gap-3 text-left">
                <span>
                  <span className="block text-xs font-bold text-amber-900">Need a new category?</span>
                  <span className="mt-0.5 block text-[11px] text-amber-800/70">Request admin approval without leaving this page.</span>
                </span>
                <ShieldAlert size={15} className="shrink-0 text-amber-600" />
              </button>
              {showCategoryRequest && (
                <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
                  {categoryNotice && (
                    <p className={`text-[11px] font-semibold ${categoryNotice.type === "error" ? "text-rose-700" : "text-emerald-700"}`}>
                      {categoryNotice.message}
                    </p>
                  )}
                  <input
                    type="text"
                    value={categoryRequestName}
                    onChange={(e) => setCategoryRequestName(e.target.value)}
                    placeholder="e.g. Risograph Printing"
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium outline-none"
                  />
                  <textarea
                    value={categoryRequestReason}
                    onChange={(e) => setCategoryRequestReason(e.target.value)}
                    rows={2}
                    placeholder="Describe what customers will upload or order under this category."
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCategoryRequest}
                    disabled={categoryRequestLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-[#EC008C] disabled:opacity-50"
                  >
                    {categoryRequestLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Send for approval
                  </button>
                </div>
              )}
            </div>
          </div>

          {hasConfigurableOptions && (
            <div id="category-size-selection" className="scroll-mt-6 rounded-2xl border-2 border-[#00AFC0]/30 bg-[#F3FFFF] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#00AFC0] text-xs font-black text-white">2</span>
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
                  <span className="text-[10px] font-semibold text-slate-400">Width × height × rate</span>
                </summary>
                <div className="grid grid-cols-2 gap-2 border-t border-cyan-100 p-3 sm:grid-cols-5">
                  <input type="text" value={customSize.label} onChange={(e) => setCustomSize((p) => ({ ...p, label: e.target.value }))} placeholder="Label" className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0] sm:col-span-1" />
                  <input type="number" min="0" step="0.01" value={customSize.width} onChange={(e) => setCustomSize((p) => ({ ...p, width: e.target.value }))} placeholder="Width" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
                  <input type="number" min="0" step="0.01" value={customSize.height} onChange={(e) => setCustomSize((p) => ({ ...p, height: e.target.value }))} placeholder="Height" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
                  <select value={customSize.unit} onChange={(e) => setCustomSize((p) => ({ ...p, unit: e.target.value }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]"><option value="in">in</option><option value="ft">ft</option><option value="cm">cm</option></select>
                  <input type="number" min="0" step="0.01" value={customSize.rate} onChange={(e) => setCustomSize((p) => ({ ...p, rate: e.target.value }))} placeholder="Price / area" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#00AFC0]" />
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
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">3</span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Price & inventory</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Set the starting price and, for ready-made products, the stock you have available.</p>
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

          {/* Physical Inventory Settings */}
          {!isService && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">Physical Stock Inventory Control</span>
                <ShieldAlert size={16} className="text-amber-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">Current Stock Quantity</label>
                  <input
                    type="number"
                    value={form.stock_qty}
                    onChange={(e) => set("stock_qty", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-800 mb-1">Low Stock Warning Limit</label>
                  <input
                    type="number"
                    value={form.low_stock_threshold}
                    onChange={(e) => set("low_stock_threshold", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          )}
            </div>

          {/* Printable Options & Spec Modifiers for Services */}
          {hasConfigurableOptions && (isService || isApparel || selectedNonSizeOptions.length > 0) && (
            <div id="customer-options" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">4</span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-black text-slate-900"><Sparkles size={15} className="text-[#EC008C]" /> Other customer choices</p>
                    <p className="mt-1 text-[10px] text-slate-500">Optional {categoryOptionConfig.materialLabel.toLowerCase()} and {categoryOptionConfig.qualityLabel.toLowerCase()}. Sizes are configured above.</p>
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
                      <p className="text-[11px] font-bold text-slate-900">T-shirt size chart & size pricing</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Checked clothing sizes are added here automatically. Edit measurements and add-on prices before saving.</p>
                    </div>
                    <button type="button" onClick={applyTshirtSizeChart} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white hover:bg-[#EC008C]">
                      Use standard clothing chart
                    </button>
                  </div>
                  {(form.specs?.size_chart || []).length > 0 && (
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
                                <button type="button" onClick={() => setForm((f) => ({ ...f, specs: { ...(f.specs || {}), size_chart: (f.specs?.size_chart || []).filter((_, rowIndex) => rowIndex !== index) } }))} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove size row ${index + 1}`}>
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button type="button" onClick={addSizeChartRow} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 hover:border-[#EC008C] hover:text-[#EC008C]"><Plus size={13} /> Add size row</button>
                </div>
              )}

              {/* Materials Selection */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">2. {categoryOptionConfig.materialLabel}</span>
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
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">3. {categoryOptionConfig.qualityLabel}</span>
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
