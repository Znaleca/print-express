"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ServiceFormModal from "@/components/owner/ServiceFormModal";
import {
  Layers,
  Plus,
  Minus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  Printer,
} from "lucide-react";

const CATEGORY_COLORS = {
  "Digital Printing": "bg-[#00FFFF] text-[#1A1A1A] border-[#1A1A1A]",
  "Offset Printing":  "bg-[#EC008C] text-white border-[#1A1A1A]",
  "Large Format":     "bg-[#1A1A1A] text-white border-[#1A1A1A]",
  "Finishing":        "bg-[#FFF200] text-[#1A1A1A] border-[#1A1A1A]",
  "Custom":           "bg-[#F4F4F1] text-[#1A1A1A] border-[#1A1A1A]",
};

export default function ServicesPage() {
  const [services,   setServices]   = useState([]);
  const [businessId, setBusinessId] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [stockDrafts, setStockDrafts] = useState({});
  const [updatingStock, setUpdatingStock] = useState(null);
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
    const draftMap = Object.fromEntries((data || []).map((s) => [s.id, String(Math.max(0, Number(s.stock_qty || 0)))]));
    setStockDrafts(draftMap);
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

    const uploadServiceImage = async (file) => {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${businessId}/${Date.now()}_${safeName}.${ext}`;

      const { error: uploadErr } = await supabase
        .storage
        .from("service-images")
        .upload(path, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from("service-images").getPublicUrl(path);
      return data?.publicUrl || null;
    };

    let serviceImageUrl = values.imageUrl || null;
    if (values.removeImage) {
      serviceImageUrl = null;
    } else if (values.imageFile) {
      serviceImageUrl = await uploadServiceImage(values.imageFile);
    }

    const payload = {
      business_id: businessId,
      name:        values.name,
      description: values.description || null,
      price:       parseFloat(values.price) || 0,
      category:    values.category || null,
      available:   values.available !== false,
      image_url:   serviceImageUrl,
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

  const saveStock = async (service) => {
    const raw = stockDrafts[service.id] ?? String(service.stock_qty ?? 0);
    const nextQty = Math.max(0, Number.parseInt(raw, 10) || 0);
    setUpdatingStock(service.id);

    const { error: err } = await supabase
      .from("services")
      .update({ stock_qty: nextQty, updated_at: new Date().toISOString() })
      .eq("id", service.id);

    if (err) {
      setError(err.message);
    } else {
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, stock_qty: nextQty } : s)));
      setStockDrafts((prev) => ({ ...prev, [service.id]: String(nextQty) }));
    }

    setUpdatingStock(null);
  };

  const adjustStockDraft = (serviceId, delta) => {
    setStockDrafts((prev) => {
      const current = Math.max(0, Number.parseInt(prev[serviceId] ?? "0", 10) || 0);
      const next = Math.max(0, current + delta);
      return { ...prev, [serviceId]: String(next) };
    });
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1920px] bg-transparent px-6 py-9 md:px-10">
        <div className="flex items-center gap-3 py-16 font-mono text-[13px] text-[#555]">
          <Loader2 className="animate-spin" size={24} />
          Loading services...
        </div>
      </div>
    );
  }

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Service_Registry // Product_Library
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                Service_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Matrix</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Control your available offerings, pricing signals, and category coverage for customer-facing discovery.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Service Count</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">{services.length} Records</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <Layers className="h-6 w-6 text-[#FFF200]" />
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                <div className="h-1 flex-1 bg-[#00FFFF]" />
                <div className="h-1 flex-1 bg-[#EC008C]" />
                <div className="h-1 flex-1 bg-[#FFF200]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <Printer size={14} className="text-white" />
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1920px] bg-transparent px-6 py-9 md:px-10 md:py-14">
        {/* Header */}
        <div className="mb-7 flex flex-col items-start justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h1 className="mb-1 flex items-center gap-3 text-[30px] font-black uppercase tracking-[-0.02em] text-[#1A1A1A]">
              <Layers size={28} /> Services
            </h1>
            <p className="font-mono text-[12px] text-[#525252]">
              Manage the printing services your shop offers.
            </p>
          </div>
          <button
            id="add-service-btn"
            onClick={() => setModal({ mode: "create" })}
            className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#EC008C]"
          >
            <Plus size={16} /> Add Service
          </button>
        </div>

      {error && (
        <div className="mb-6 inline-flex items-center gap-2 border-2 border-[#EC008C] bg-[#FFF4FA] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#EC008C]">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Empty state */}
      {services.length === 0 ? (
        <div className="flex flex-col items-center border-4 border-[#1A1A1A] bg-white px-6 py-12 text-center shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
          <Layers size={48} className="mb-3 text-[#EC008C]" />
          <h2 className="text-2xl font-black uppercase italic tracking-tight text-[#1A1A1A]">No services yet</h2>
          <p className="mt-2 max-w-xl font-mono text-[11px] uppercase tracking-[0.12em] text-[#666]">
            Add your first service so customers can discover what you offer.
          </p>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="mt-5 inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#EC008C]"
          >
            <Plus size={16} /> Add First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {services.map((svc) => (
            <div
              key={svc.id}
              className={`border-4 border-[#1A1A1A] bg-white p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] transition-transform hover:-translate-y-[2px] ${!svc.available ? "opacity-70" : ""}`}
            >
              {/* Header row */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {svc.category && (
                    <span className={`inline-flex items-center border-2 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] ${CATEGORY_COLORS[svc.category] || CATEGORY_COLORS.Custom}`}>
                      {svc.category}
                    </span>
                  )}
                  <span className={`inline-flex items-center border-2 border-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] ${svc.available ? "bg-[#00FFFF] text-[#1A1A1A]" : "bg-[#F4F4F1] text-[#666]"}`}>
                    {svc.available ? "Available" : "Unavailable"}
                  </span>
                  <span className="inline-flex items-center border-2 border-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] bg-[#FFF200] text-[#1A1A1A]">
                    Stock {Math.max(0, Number(svc.stock_qty || 0))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(svc)}
                    disabled={toggling === svc.id}
                    className="inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] transition-colors hover:bg-[#00FFFF] disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] transition-colors hover:bg-[#FFF200]"
                    title="Edit service"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(svc.id)}
                    disabled={deleting === svc.id}
                    className="inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] transition-colors hover:bg-[#EC008C] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    title="Delete service"
                  >
                    {deleting === svc.id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              </div>

              {/* Body */}
              {svc.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={svc.image_url}
                  alt={`${svc.name} preview`}
                  className="mb-4 h-44 w-full border-2 border-[#1A1A1A] object-cover"
                />
              )}
              <h3 className="text-xl font-black uppercase tracking-tight text-[#1A1A1A]">{svc.name}</h3>
              {svc.description && (
                <p className="mt-2 text-sm leading-relaxed text-[#555]">{svc.description}</p>
              )}

              {/* Price */}
              <div className="mt-5 border-t-2 border-[#1A1A1A]/10 pt-4">
                <span className="font-mono text-2xl font-black uppercase tracking-tight text-[#EC008C]">
                  ₱{parseFloat(svc.price).toFixed(2)}
                </span>
              </div>

              {/* Stock edit outside modal */}
              <div className="mt-4 border-t-2 border-[#1A1A1A]/10 pt-4">
                <label className="mb-2 block font-mono text-[9px] font-black uppercase tracking-[0.15em] text-[#1A1A1A]/60">
                  Stock Left
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustStockDraft(svc.id, -1)}
                    className="inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] transition-colors hover:bg-[#FFF200]"
                    aria-label="Decrease stock"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stockDrafts[svc.id] ?? String(Math.max(0, Number(svc.stock_qty || 0)))}
                    onChange={(e) => setStockDrafts((prev) => ({ ...prev, [svc.id]: e.target.value }))}
                    className="w-24 border-2 border-[#1A1A1A]/20 bg-white px-2 py-2 text-center text-sm font-black text-[#1A1A1A] outline-none focus:border-[#00FFFF]"
                  />
                  <button
                    type="button"
                    onClick={() => adjustStockDraft(svc.id, 1)}
                    className="inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] transition-colors hover:bg-[#00FFFF]"
                    aria-label="Increase stock"
                  >
                    <Plus size={14} />
                  </button>

                  {(() => {
                    const current = Math.max(0, Number.parseInt(String(svc.stock_qty ?? 0), 10) || 0);
                    const draft = Math.max(0, Number.parseInt(stockDrafts[svc.id] ?? String(current), 10) || 0);
                    const isDirty = draft !== current;
                    if (!isDirty) return null;

                    return (
                      <button
                        type="button"
                        onClick={() => saveStock(svc)}
                        disabled={updatingStock === svc.id}
                        className="inline-flex items-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-white hover:bg-[#EC008C] disabled:opacity-50"
                      >
                        {updatingStock === svc.id ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                      </button>
                    );
                  })()}
                </div>
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
      </section>
    </main>
  );
}
