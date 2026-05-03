"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, ImagePlus, ImageOff } from "lucide-react";

const CATEGORIES = [
  "Digital Printing",
  "Offset Printing",
  "Large Format",
  "Finishing",
  "Custom",
];

const EMPTY_SERVICE = {
  item_type: "service",
  name: "",
  description: "",
  price: "",      // price_min for services
  price_max: "",  // price_max for services (empty = not set)
  category: "",
  available: true,
  imageUrl: null,
  imageFile: null,
  removeImage: false,
  stock_qty: "",
};

const EMPTY_PRODUCT = {
  item_type: "product",
  name: "",
  description: "",
  price: "",      // exact price for products
  price_max: "",
  category: "",
  available: true,
  imageUrl: null,
  imageFile: null,
  removeImage: false,
  stock_qty: "0",
};

export default function ServiceFormModal({ mode, initial, onSave, onClose, forcedType }) {
  const defaultType = forcedType || initial?.item_type || "service";

  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        item_type:   initial.item_type   || defaultType,
        name:        initial.name        || "",
        description: initial.description || "",
        price:       initial.price != null ? String(initial.price) : "",
        price_max:   initial.price_max != null ? String(initial.price_max) : "",
        category:    initial.category    || "",
        available:   initial.available   !== false,
        imageUrl:    initial.image_url   || null,
        imageFile:   null,
        removeImage: false,
        stock_qty:   initial.stock_qty != null ? String(initial.stock_qty) : "0",
      };
    }
    return defaultType === "product" ? { ...EMPTY_PRODUCT } : { ...EMPTY_SERVICE };
  });

  const [imagePreview, setImagePreview] = useState(initial?.image_url || null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const isService = form.item_type === "service";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }

    const priceVal = parseFloat(form.price);
    if (isNaN(priceVal) || priceVal < 0) {
      setError(isService ? "Enter a valid minimum price (0 or more)." : "Enter a valid price (0 or more).");
      return;
    }

    if (isService && form.price_max !== "") {
      const maxVal = parseFloat(form.price_max);
      if (isNaN(maxVal) || maxVal < priceVal) {
        setError("Maximum price must be greater than or equal to the minimum price.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || "Failed to save.");
      setSaving(false);
    }
  };

  const title = mode === "edit"
    ? `Edit ${isService ? "Service" : "Product"}`
    : `Add New ${isService ? "Service" : "Product"}`;

  const fieldLabelClass = "mb-2 block font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/70";
  const inputClass = "w-full border-2 border-[#1A1A1A]/20 bg-white px-3 py-2 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#00FFFF]";

  const onPickImage = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setForm((f) => ({ ...f, imageFile: file, removeImage: false }));
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeServiceImage = () => {
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setForm((f) => ({ ...f, imageFile: null, imageUrl: null, removeImage: true }));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl border-4 border-[#1A1A1A] bg-white shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-4 border-[#1A1A1A] bg-[#1A1A1A] px-5 py-4 text-white shrink-0">
          <h2 className="font-black uppercase italic tracking-tighter">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center border-2 border-white/30 text-white transition-colors hover:bg-[#EC008C]"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="space-y-5 p-5 md:p-6">
            {error && (
              <div className="border-2 border-[#EC008C] bg-[#FFF4FA] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#EC008C]">{error}</div>
            )}

            {/* Type switcher — only shown when not forced */}
            {!forcedType && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, item_type: "service", price_max: "", stock_qty: "" }))}
                  className={`flex-1 py-2 border-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] transition-colors ${
                    isService
                      ? "bg-[#1A1A1A] border-[#1A1A1A] text-white"
                      : "bg-white border-[#1A1A1A]/20 text-[#1A1A1A] hover:border-[#1A1A1A]"
                  }`}
                >
                  Service
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, item_type: "product", price_max: "", stock_qty: f.stock_qty || "0" }))}
                  className={`flex-1 py-2 border-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] transition-colors ${
                    !isService
                      ? "bg-[#1A1A1A] border-[#1A1A1A] text-white"
                      : "bg-white border-[#1A1A1A]/20 text-[#1A1A1A] hover:border-[#1A1A1A]"
                  }`}
                >
                  Product
                </button>
              </div>
            )}

            {/* Name */}
            <div>
              <label className={fieldLabelClass} htmlFor="svc-name">
                {isService ? "Service" : "Product"} Name <span className="text-[#EC008C]">*</span>
              </label>
              <input
                id="svc-name"
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={isService ? "e.g. Business Card Printing" : "e.g. A4 Photo Paper (100pcs)"}
                className={inputClass}
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className={fieldLabelClass} htmlFor="svc-desc">Description</label>
              <textarea
                id="svc-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={`Brief description of this ${isService ? "service" : "product"}…`}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </div>

            {/* Price fields */}
            {isService ? (
              /* Service: estimated price range */
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClass} htmlFor="svc-price-min">
                    Est. Price From (₱) <span className="text-[#EC008C]">*</span>
                  </label>
                  <input
                    id="svc-price-min"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    placeholder="100.00"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={fieldLabelClass} htmlFor="svc-price-max">
                    Est. Price To (₱) <span className="text-[#1A1A1A]/40 font-normal">optional</span>
                  </label>
                  <input
                    id="svc-price-max"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_max}
                    onChange={(e) => set("price_max", e.target.value)}
                    placeholder="500.00"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <p className="font-mono text-[10px] text-[#1A1A1A]/50 uppercase tracking-widest">
                    Shown to customers as: Estimated ₱{form.price || "0"}{form.price_max ? ` – ₱${form.price_max}` : "+"}
                  </p>
                </div>
              </div>
            ) : (
              /* Product: exact price + stock */
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClass} htmlFor="svc-price">
                    Exact Price (₱) <span className="text-[#EC008C]">*</span>
                  </label>
                  <input
                    id="svc-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={fieldLabelClass} htmlFor="svc-stock">
                    Stock Quantity <span className="text-[#EC008C]">*</span>
                  </label>
                  <input
                    id="svc-stock"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_qty}
                    onChange={(e) => set("stock_qty", e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Category */}
            <div>
              <label className={fieldLabelClass} htmlFor="svc-category">Category</label>
              <select
                id="svc-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={inputClass}
              >
                <option value="">— Select category —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Image */}
            <div>
              <label className={fieldLabelClass}>
                {isService ? "Service" : "Product"} Image
              </label>
              <div className="border-2 border-[#1A1A1A]/10 bg-[#F9F9F7] p-3">
                {imagePreview ? (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-44 w-full border-2 border-[#1A1A1A] bg-white object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeServiceImage}
                      className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-white px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.15em] hover:bg-[#EC008C] hover:text-white"
                    >
                      <ImageOff size={12} /> Remove
                    </button>
                  </div>
                ) : (
                  <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-[#1A1A1A]/20 bg-white text-center hover:border-[#00FFFF]">
                    <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                    <ImagePlus size={24} className="mb-2 text-[#1A1A1A]" />
                    <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/70">Upload Image</span>
                  </label>
                )}
              </div>
            </div>

            {/* Availability toggle */}
            <div className="flex items-center gap-3 rounded border-2 border-[#1A1A1A]/10 bg-[#F9F9F7] px-3 py-3">
              <label className={`${fieldLabelClass} mb-0`} htmlFor="svc-available">
                Available to customers
              </label>
              <button
                id="svc-available"
                type="button"
                onClick={() => set("available", !form.available)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-[#1A1A1A] transition-colors ${form.available ? "bg-[#00FFFF]" : "bg-white"}`}
                aria-pressed={form.available}
              >
                <span className={`h-4 w-4 rounded-full border border-[#1A1A1A] bg-white transition-transform ${form.available ? "translate-x-5" : "translate-x-1"}`} />
              </button>
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A1A]/70">
                {form.available ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t-2 border-[#1A1A1A]/10 px-5 py-4 md:px-6 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#1A1A1A] transition-colors hover:bg-[#FFF200]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving}
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Save size={14} /> {mode === "edit" ? "Save Changes" : `Add ${isService ? "Service" : "Product"}`}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
