"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ServiceFormModal from "@/components/owner/ServiceFormModal";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

const CATEGORY_COLORS = {
  "Digital Printing": "cat-badge cat-badge--blue",
  "Offset Printing":  "cat-badge cat-badge--green",
  "Large Format":     "cat-badge cat-badge--purple",
  "Finishing":        "cat-badge cat-badge--orange",
  "Custom":           "cat-badge cat-badge--gray",
};

export default function ServicesPage() {
  const [services,   setServices]   = useState([]);
  const [businessId, setBusinessId] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [modal,      setModal]      = useState(null); // null | { mode: 'create' | 'edit', service? }
  const [deleting,   setDeleting]   = useState(null); // service id being deleted
  const [toggling,   setToggling]   = useState(null); // service id being toggled

  const loadServices = async (bizId) => {
    const { data, error: err } = await supabase
      .from("services")
      .select("*")
      .eq("business_id", bizId)
      .order("created_at", { ascending: false });

    if (err) { setError(err.message); return; }
    setServices(data || []);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!biz) { setLoading(false); return; }

      setBusinessId(biz.id);
      await loadServices(biz.id);
      setLoading(false);
    };
    init();
  }, []);

  const handleSave = async (values) => {
    if (!businessId) return;

    const payload = {
      business_id: businessId,
      name:        values.name,
      description: values.description || null,
      price:       parseFloat(values.price) || 0,
      category:    values.category || null,
      available:   values.available !== false,
      updated_at:  new Date().toISOString(),
    };

    if (modal?.mode === "edit" && modal.service?.id) {
      const { error: err } = await supabase
        .from("services")
        .update(payload)
        .eq("id", modal.service.id);
      if (err) throw err;
    } else {
      const { error: err } = await supabase
        .from("services")
        .insert(payload);
      if (err) throw err;
    }

    await loadServices(businessId);
    setModal(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this service? This cannot be undone.")) return;
    setDeleting(id);
    await supabase.from("services").delete().eq("id", id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  };

  const handleToggle = async (service) => {
    setToggling(service.id);
    const { error: err } = await supabase
      .from("services")
      .update({ available: !service.available, updated_at: new Date().toISOString() })
      .eq("id", service.id);

    if (!err) {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, available: !s.available } : s))
      );
    }
    setToggling(null);
  };

  if (loading) {
    return (
      <div className="owner-page">
        <div className="owner-loading">
          <Loader2 className="animate-spin" size={24} />
          Loading services…
        </div>
      </div>
    );
  }

  return (
    <div className="owner-page">
      {/* Header */}
      <div className="owner-page__header">
        <div>
          <h1 className="owner-page__title">
            <Layers size={28} /> Services
          </h1>
          <p className="owner-page__subtitle">
            Manage the printing services your shop offers.
          </p>
        </div>
        <button
          id="add-service-btn"
          onClick={() => setModal({ mode: "create" })}
          className="owner-btn owner-btn--primary"
        >
          <Plus size={16} /> Add Service
        </button>
      </div>

      {error && (
        <div className="owner-toast owner-toast--error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Empty state */}
      {services.length === 0 ? (
        <div className="services-empty">
          <Layers size={48} className="services-empty__icon" />
          <h2 className="services-empty__title">No services yet</h2>
          <p className="services-empty__text">
            Add your first service so customers can discover what you offer.
          </p>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="owner-btn owner-btn--primary"
          >
            <Plus size={16} /> Add First Service
          </button>
        </div>
      ) : (
        <div className="services-grid">
          {services.map((svc) => (
            <div
              key={svc.id}
              className={`service-card ${!svc.available ? "service-card--disabled" : ""}`}
            >
              {/* Header row */}
              <div className="service-card__header">
                <div className="service-card__meta">
                  {svc.category && (
                    <span className={CATEGORY_COLORS[svc.category] || "cat-badge cat-badge--gray"}>
                      {svc.category}
                    </span>
                  )}
                  <span className={`avail-dot ${svc.available ? "avail-dot--on" : "avail-dot--off"}`}>
                    {svc.available ? "Available" : "Unavailable"}
                  </span>
                </div>
                <div className="service-card__actions">
                  <button
                    onClick={() => handleToggle(svc)}
                    disabled={toggling === svc.id}
                    className="icon-btn icon-btn--toggle"
                    title={svc.available ? "Mark unavailable" : "Mark available"}
                  >
                    {toggling === svc.id
                      ? <Loader2 size={16} className="animate-spin" />
                      : svc.available
                        ? <ToggleRight size={20} />
                        : <ToggleLeft size={20} />
                    }
                  </button>
                  <button
                    onClick={() => setModal({ mode: "edit", service: svc })}
                    className="icon-btn icon-btn--edit"
                    title="Edit service"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(svc.id)}
                    disabled={deleting === svc.id}
                    className="icon-btn icon-btn--delete"
                    title="Delete service"
                  >
                    {deleting === svc.id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              </div>

              {/* Body */}
              <h3 className="service-card__name">{svc.name}</h3>
              {svc.description && (
                <p className="service-card__desc">{svc.description}</p>
              )}

              {/* Price */}
              <div className="service-card__footer">
                <span className="service-card__price">
                  ₱{parseFloat(svc.price).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ServiceFormModal
          mode={modal.mode}
          initial={modal.service || null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
