"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, ImagePlus, ImageOff, Layers, Sparkles, Plus, Trash2, ShieldAlert, AlertCircle, Send, Calculator } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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

export default function ServiceFormModal({ mode, initialValues, onSave, onClose, forcedType, businessId }) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Item name is required.");
    
    const parsedPrice = parseFloat(form.price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return setError("Please enter a valid price (₱0 or higher).");
    }

    setSaving(true);
    setError(null);

    try {
      let finalImageUrl = form.imageUrl;
      if (form.imageFile) {
        const fileExt = form.imageFile.name.split(".").pop();
        const filePath = `services/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage.from("chat-images").upload(filePath, form.imageFile);
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(filePath);
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="font-bold text-base text-slate-900">
            {mode === "create" ? `Add New ${isService ? "Service" : "Product"}` : `Edit ${isService ? "Service" : "Product"}`}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

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
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-amber-900">Request a new category</p>
                <ShieldAlert size={15} className="text-amber-600 shrink-0" />
              </div>
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
                className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-medium outline-none"
              />
              <textarea
                value={categoryRequestReason}
                onChange={(e) => setCategoryRequestReason(e.target.value)}
                rows={2}
                placeholder="Describe what customers will upload or order under this category."
                className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-medium outline-none"
              />
              <button
                type="button"
                onClick={handleCategoryRequest}
                disabled={categoryRequestLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-[#EC008C] disabled:opacity-50"
              >
                {categoryRequestLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send for approval
              </button>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {selectedAllOptions.map((optName) => (
                      <div key={optName} className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-slate-800 text-[11px]">{optName}</span>
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Describe paper finish, turnaround speed, or custom options..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            />
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-colors flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Item Specs
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
