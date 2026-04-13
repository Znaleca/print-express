"use client";

import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";

const CATEGORIES = [
  "Digital Printing",
  "Offset Printing",
  "Large Format",
  "Finishing",
  "Custom",
];

const EMPTY = {
  name: "",
  description: "",
  price: "",
  category: "",
  available: true,
};

export default function ServiceFormModal({ mode, initial, onSave, onClose }) {
  const [form,    setForm]    = useState(initial ? {
    name:        initial.name        || "",
    description: initial.description || "",
    price:       initial.price != null ? String(initial.price) : "",
    category:    initial.category   || "",
    available:   initial.available  !== false,
  } : { ...EMPTY });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Service name is required."); return; }
    if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
      setError("Enter a valid price (0 or more)."); return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || "Failed to save service.");
      setSaving(false);
    }
  };

  const title = mode === "edit" ? "Edit Service" : "Add New Service";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        {/* Header */}
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button onClick={onClose} className="modal__close" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          {error && (
            <div className="modal-error">{error}</div>
          )}

          {/* Name */}
          <div className="form-field">
            <label className="form-field__label" htmlFor="svc-name">
              Service Name <span className="form-field__req">*</span>
            </label>
            <input
              id="svc-name"
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Business Card Printing"
              className="form-field__input"
              required
            />
          </div>

          {/* Description */}
          <div className="form-field">
            <label className="form-field__label" htmlFor="svc-desc">Description</label>
            <textarea
              id="svc-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this service…"
              rows={3}
              className="form-field__textarea"
            />
          </div>

          {/* Price + Category row */}
          <div className="form-row">
            <div className="form-field">
              <label className="form-field__label" htmlFor="svc-price">
                Price (₱) <span className="form-field__req">*</span>
              </label>
              <input
                id="svc-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
                className="form-field__input"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="svc-category">Category</label>
              <select
                id="svc-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="form-field__select"
              >
                <option value="">— Select category —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Availability toggle */}
          <div className="form-field form-field--inline">
            <label className="form-field__label" htmlFor="svc-available">
              Available to customers
            </label>
            <button
              id="svc-available"
              type="button"
              onClick={() => set("available", !form.available)}
              className={`toggle-switch ${form.available ? "toggle-switch--on" : "toggle-switch--off"}`}
              aria-pressed={form.available}
            >
              <span className="toggle-switch__knob" />
            </button>
            <span className="toggle-switch__label">
              {form.available ? "Yes" : "No"}
            </span>
          </div>

          {/* Footer */}
          <div className="modal__footer">
            <button type="button" onClick={onClose} className="owner-btn owner-btn--ghost">
              Cancel
            </button>
            <button type="submit" className="owner-btn owner-btn--primary" disabled={saving}>
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Save size={14} /> {mode === "edit" ? "Save Changes" : "Add Service"}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
