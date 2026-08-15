"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, ImagePlus, ImageOff, Layers, Sparkles, Plus, Trash2, ShieldAlert, AlertCircle, Send, Calculator } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";

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

const SIZE_PRESETS = ["Standard (3.5\" x 2\")", "A4 (8.27\" x 11.69\")", "A3 (11.69\" x 16.54\")", "2 x 3 ft Banner", "3 x 4 ft Banner", "4 x 8 ft Sheet"];
const MATERIAL_PRESETS = ["Bond Paper (80gsm)", "Glossy Paper (220gsm)", "Matte Cardstock (300gsm)", "Outdoor Vinyl Tarpaulin", "Waterproof Glossy Sticker", "Clear Vinyl Sticker"];
const QUALITY_PRESETS = ["Standard Quality (720 DPI)", "High Quality (1440 DPI)", "Ultra Premium Photo Grade"];

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
  specs: { ...EMPTY_SPECS }
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
          allowed_sizes:     existingSpecs.allowed_sizes || ["A4 (8.27\" x 11.69\")"],
          allowed_materials: existingSpecs.allowed_materials || ["Glossy Paper (220gsm)"],
          quality_levels:    existingSpecs.quality_levels || ["Standard Quality (720 DPI)"],
          price_modifiers:   existingSpecs.price_modifiers || {},
          default_size:      existingSpecs.default_size || null,
          default_material:  existingSpecs.default_material || null,
          default_quality:   existingSpecs.default_quality || null,
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

  const toggleOption = (categoryKey, optionName) => {
    setForm((f) => {
      const currentList = f.specs?.[categoryKey] || [];
      const isSelected = currentList.includes(optionName);
      const updatedList = isSelected ? currentList.filter(item => item !== optionName) : [...currentList, optionName];
      
      const newModifiers = { ...(f.specs?.price_modifiers || {}) };
      if (isSelected) {
        delete newModifiers[optionName];
      }

      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: updatedList,
          price_modifiers: newModifiers
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

  const setDefaultSpec = (key, value) => {
    setForm((f) => ({
      ...f,
      specs: {
        ...(f.specs || {}),
        [key]: value,
      },
    }));
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
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: current.includes(label) ? current : [...current, label],
          price_modifiers: {
            ...(f.specs?.price_modifiers || {}),
            [label]: modifier,
          },
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
      return {
        ...f,
        specs: {
          ...(f.specs || {}),
          [categoryKey]: (f.specs?.[categoryKey] || []).filter((option) => option !== optionName),
          price_modifiers: nextModifiers,
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

      const finalSpecs = {
        ...form.specs,
        price_modifiers: cleanModifiers,
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

  const selectedAllOptions = [
    ...(form.specs?.allowed_sizes || []),
    ...(form.specs?.allowed_materials || []),
    ...(form.specs?.quality_levels || [])
  ];

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

        <form onSubmit={handleSubmit} className={`${embedded ? "p-6 sm:p-8 lg:p-10" : "p-6"} space-y-5`}>
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="rounded-2xl border border-[#D8D6CE] bg-[#FCFCFA] px-4 py-3 text-xs font-semibold text-slate-600">
            Complete the item details below, then save when everything is ready. Required fields are checked before saving.
          </div>

          <div className="space-y-5">

          {/* Item Type Switcher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Item Category Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => set("item_type", "service")}
                className={`py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  isService ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Custom Service (Made-to-Order)
              </button>
              <button
                type="button"
                onClick={() => set("item_type", "product")}
                className={`py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                  !isService ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Physical Product (Ready-Made)
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            >
              <option value="">Select Category</option>
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

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold text-slate-700">Item Image</label>
              <span className="text-[10px] font-semibold text-slate-400">Auto-compressed · 5MB max</span>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-44 sm:w-44">
                {imagePreview ? (
                  <img src={imagePreview} alt="Item preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageOff size={32} />
                    <span className="text-[11px] font-semibold">No image yet</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
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
            </div>

          <div className="space-y-5 border-t border-[#D8D6CE] pt-6">
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
          {isService && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-[#EC008C]" /> Printable Options & Option-Based Price Modifiers
                </p>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_customizable}
                    onChange={(e) => set("is_customizable", e.target.checked)}
                    className="rounded text-[#EC008C] focus:ring-[#EC008C]"
                  />
                  <span>Allow Custom Artwork / Specs Notes</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                When enabled, customers can submit custom instructions with their selected size, material, and quality. Physical product stock is managed separately below.
              </p>

              {/* Sizes Selection */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">1. Available Print Sizes</span>
                <div className="flex flex-wrap gap-1.5">
                  {SIZE_PRESETS.map((sz) => {
                    const isChecked = (form.specs?.allowed_sizes || []).includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleOption("allowed_sizes", sz)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          isChecked ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                      <Calculator size={14} className="text-[#00AEEF]" /> Preset size price calculator
                    </span>
                    <span className="text-[10px] text-slate-500">width x height x rate</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      value={customSize.label}
                      onChange={(e) => setCustomSize((p) => ({ ...p, label: e.target.value }))}
                      placeholder="Label"
                      className="sm:col-span-1 px-3 py-2 bg-white border border-cyan-200 rounded-lg text-xs outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customSize.width}
                      onChange={(e) => setCustomSize((p) => ({ ...p, width: e.target.value }))}
                      placeholder="Width"
                      className="px-3 py-2 bg-white border border-cyan-200 rounded-lg text-xs outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customSize.height}
                      onChange={(e) => setCustomSize((p) => ({ ...p, height: e.target.value }))}
                      placeholder="Height"
                      className="px-3 py-2 bg-white border border-cyan-200 rounded-lg text-xs outline-none"
                    />
                    <select
                      value={customSize.unit}
                      onChange={(e) => setCustomSize((p) => ({ ...p, unit: e.target.value }))}
                      className="px-3 py-2 bg-white border border-cyan-200 rounded-lg text-xs outline-none"
                    >
                      <option value="in">in</option>
                      <option value="ft">ft</option>
                      <option value="cm">cm</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customSize.rate}
                      onChange={(e) => setCustomSize((p) => ({ ...p, rate: e.target.value }))}
                      placeholder="Price / area"
                      className="px-3 py-2 bg-white border border-cyan-200 rounded-lg text-xs outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCalculatedSizePreset}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-[#EC008C]"
                  >
                    <Plus size={13} /> Add calculated size
                  </button>
                  {(form.specs?.allowed_sizes || []).filter((size) => !SIZE_PRESETS.includes(size)).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(form.specs?.allowed_sizes || []).filter((size) => !SIZE_PRESETS.includes(size)).map((size) => (
                        <span key={size} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-cyan-200">
                          <span className="truncate">{size}</span>
                          <button type="button" onClick={() => removeOption("allowed_sizes", size)} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${size}`}>
                            <Trash2 size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Materials Selection */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">2. Paper Stock & Materials</span>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIAL_PRESETS.map((mat) => {
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
                    placeholder="Custom paper or material"
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
                    <Plus size={13} /> Add paper
                  </button>
                </div>
                {(form.specs?.allowed_materials || []).filter((material) => !MATERIAL_PRESETS.includes(material)).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(form.specs?.allowed_materials || []).filter((material) => !MATERIAL_PRESETS.includes(material)).map((material) => (
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
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">3. Print Quality Levels</span>
                <div className="flex flex-wrap gap-1.5">
                  {QUALITY_PRESETS.map((q) => {
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
                    placeholder="Custom quality level"
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
                    <Plus size={13} /> Add quality
                  </button>
                </div>
                {(form.specs?.quality_levels || []).filter((quality) => !QUALITY_PRESETS.includes(quality)).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(form.specs?.quality_levels || []).filter((quality) => !QUALITY_PRESETS.includes(quality)).map((quality) => (
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Default Size</label>
                  <select
                    value={form.specs?.default_size || ""}
                    onChange={(e) => setDefaultSpec("default_size", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                  >
                    <option value="">Select default</option>
                    {(form.specs?.allowed_sizes || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Default Material</label>
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
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Default Quality</label>
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
              {selectedAllOptions.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-900 block">4. Option Price Modifiers (added to base price)</span>
                  <div className="grid grid-cols-1 gap-2 pr-1 sm:grid-cols-2">
                    {selectedAllOptions.map((optName) => (
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

          {!isService && (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-6 text-center">
              <Sparkles size={24} className="mx-auto text-[#00AEEF]" />
              <h3 className="mt-3 text-sm font-black text-slate-900">Print options are for custom services</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-600">Ready-made products use a fixed configuration. Stock and selling price are managed above.</p>
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
