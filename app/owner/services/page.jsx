"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, Edit, Trash2, Power, Loader2, Package, History
} from "lucide-react";
import ServiceFormModal from "@/components/owner/ServiceFormModal";

export default function OwnerServicesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [businessId, setBusinessId] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', item?: object, forcedType?: 'service'|'product' }
  const [toggling, setToggling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [updatingStock, setUpdatingStock] = useState(null);
  const [stockDrafts, setStockDrafts] = useState({});
  const [inventoryMovements, setInventoryMovements] = useState({});
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("ALL"); // 'ALL', 'service', 'product'

  const loadItems = useCallback(async (bizId) => {
    // 1. Fetch baseline services
    const { data: servicesData, error: err } = await supabase
      .from("services")
      .select("*")
      .eq("business_id", bizId)
      .order("created_at", { ascending: false });

    if (err) { setError(err.message); return; }

    // 2. Fetch option rules from separate service_pricing_rules table
    const { data: rulesData } = await supabase
      .from("service_pricing_rules")
      .select("*")
      .eq("business_id", bizId);

    const rulesByService = {};
    (rulesData || []).forEach((r) => {
      if (!rulesByService[r.service_id]) {
        rulesByService[r.service_id] = {
          allowed_sizes: [],
          allowed_materials: [],
          quality_levels: [],
          price_modifiers: {},
        };
      }
      if (r.option_type === "SIZE") rulesByService[r.service_id].allowed_sizes.push(r.option_name);
      if (r.option_type === "MATERIAL") rulesByService[r.service_id].allowed_materials.push(r.option_name);
      if (r.option_type === "QUALITY") rulesByService[r.service_id].quality_levels.push(r.option_name);
      rulesByService[r.service_id].price_modifiers[r.option_name] = Number(r.price_modifier || 0);
    });

    const mergedItems = (servicesData || []).map((s) => ({
      ...s,
      specs_json: s.specs_json || rulesByService[s.id] || {},
    }));

    setItems(mergedItems);

    const draftMap = Object.fromEntries(
      (servicesData || [])
        .filter((s) => s.item_type === "product")
        .map((s) => [s.id, String(Math.max(0, Number(s.stock_qty || 0)))])
    );
    setStockDrafts(draftMap);

    const serviceIds = (servicesData || []).map((s) => s.id);
    if (serviceIds.length > 0) {
      const { data: movementRows } = await supabase
        .from("inventory_movements")
        .select("id, service_id, qty_change, new_stock_qty, reason, note, created_at")
        .in("service_id", serviceIds)
        .order("created_at", { ascending: false })
        .limit(50);

      const movementMap = {};
      (movementRows || []).forEach((row) => {
        if (!movementMap[row.service_id]) movementMap[row.service_id] = [];
        if (movementMap[row.service_id].length < 3) movementMap[row.service_id].push(row);
      });
      setInventoryMovements(movementMap);
    } else {
      setInventoryMovements({});
    }
  }, []);

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
      await loadItems(biz.id);
      setLoading(false);
    };
    init();
  }, [loadItems]);

  const handleSave = async (values) => {
    if (!businessId) {
      throw new Error("No active shop profile found for your account. Please register your shop first.");
    }

    const safeStockQty = values.item_type === "product"
      ? Math.max(0, Number.parseInt(values.stock_qty || "0", 10))
      : 0;

    // Save main service row without modifying existing table structure
    const mainPayload = {
      business_id: businessId,
      name: values.name,
      description: values.description,
      price: values.price,
      price_max: values.item_type === "product" ? null : (values.price_max || null),
      category: values.category || "General Printing",
      item_type: values.item_type,
      available: values.available !== false,
      is_customizable: values.is_customizable !== false,
      specs_json: values.specs_json || {},
      image_url: values.image_url,
      stock_qty: safeStockQty,
      low_stock_threshold: values.item_type === "product" ? Math.max(0, Number.parseInt(values.low_stock_threshold || "10", 10)) : 10,
    };

    let serviceId = modal.item?.id;

    if (modal.mode === "create") {
      const { data: created, error: insertErr } = await supabase
        .from("services")
        .insert(mainPayload)
        .select("id")
        .single();

      if (insertErr) throw new Error(insertErr.message || "Failed to create service");
      serviceId = created.id;
      if (values.item_type === "product" && safeStockQty > 0) {
        await supabase.from("inventory_movements").insert({
          business_id: businessId,
          service_id: serviceId,
          qty_change: safeStockQty,
          new_stock_qty: safeStockQty,
          reason: "RESTOCK",
          note: "Initial stock on product creation",
        });
      }
    } else {
      const { error: updateErr } = await supabase
        .from("services")
        .update(mainPayload)
        .eq("id", serviceId);

      if (updateErr) throw new Error(updateErr.message || "Failed to update service");
    }

    // Save Option-Based Price Modifiers into NEW separate table: service_pricing_rules
    if (serviceId && values.specs_json) {
      const specs = values.specs_json;
      const modifiers = specs.price_modifiers || {};

      await supabase.from("service_pricing_rules").delete().eq("service_id", serviceId);

      const rulesToInsert = [];

      (specs.allowed_sizes || []).forEach((sz) => {
        rulesToInsert.push({
          business_id: businessId,
          service_id: serviceId,
          option_type: "SIZE",
          option_name: sz,
          price_modifier: modifiers[sz] || 0,
          is_default: specs.default_size === sz,
          sort_order: rulesToInsert.length,
        });
      });

      (specs.allowed_materials || []).forEach((mat) => {
        rulesToInsert.push({
          business_id: businessId,
          service_id: serviceId,
          option_type: "MATERIAL",
          option_name: mat,
          price_modifier: modifiers[mat] || 0,
          is_default: specs.default_material === mat,
          sort_order: rulesToInsert.length,
        });
      });

      (specs.quality_levels || []).forEach((q) => {
        rulesToInsert.push({
          business_id: businessId,
          service_id: serviceId,
          option_type: "QUALITY",
          option_name: q,
          price_modifier: modifiers[q] || 0,
          is_default: specs.default_quality === q,
          sort_order: rulesToInsert.length,
        });
      });

      if (rulesToInsert.length > 0) {
        const { error: rulesErr } = await supabase.from("service_pricing_rules").insert(rulesToInsert);
        if (rulesErr) console.warn("Notice: To persist option price modifiers, run printing-products-services-upgrade.sql in Supabase SQL Editor.", rulesErr);
      }
    }

    setModal(null);
    await loadItems(businessId);
  };

  const handleToggle = async (item) => {
    setToggling(item.id);
    const next = !item.available;
    await supabase.from("services").update({ available: next }).eq("id", item.id);
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, available: next } : s)));
    setToggling(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this catalog item?")) return;
    setDeleting(id);
    await supabase.from("services").delete().eq("id", id);
    setItems((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  };

  const handleStockUpdate = async (item, newQty) => {
    setUpdatingStock(item.id);
    try {
      const qty = Math.max(0, Number.parseInt(newQty, 10) || 0);
      const previousQty = Number(item.stock_qty || 0);
      await supabase.from("services").update({ stock_qty: qty }).eq("id", item.id);
      await supabase.from("inventory_movements").insert({
        business_id: businessId,
        service_id: item.id,
        qty_change: qty - previousQty,
        new_stock_qty: qty,
        reason: "MANUAL_ADJUSTMENT",
        note: "Owner updated stock from catalog",
      });
      setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, stock_qty: qty } : s)));
      setStockDrafts((prev) => ({ ...prev, [item.id]: String(qty) }));
      await loadItems(businessId);
    } finally {
      setUpdatingStock(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading catalog items...</p>
        </div>
      </main>
    );
  }

  const filteredItems = items.filter((item) => {
    if (filterType === "service") return item.item_type === "service";
    if (filterType === "product") return item.item_type === "product";
    return true;
  });

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      {/* Header Banner */}
      <section className="bg-white border-b border-slate-200 py-5 px-4 sm:px-6 lg:px-8 relative shadow-sm">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Services & Product Catalog</h1>
            <p className="mt-0.5 text-xs text-slate-500">Manage on-demand print services, custom size pricing, and physical store inventory.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ mode: "create", forcedType: "service" })}
              className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={16} /> Add Custom Service
            </button>

            <button
              onClick={() => setModal({ mode: "create", forcedType: "product" })}
              className="px-3.5 py-2 border border-slate-200 bg-white text-slate-800 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Package size={16} /> Add Ready Product
            </button>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            General business information such as shop name, address, contact details, logo, payment QR, and downpayment rules belongs in the business profile.
          </span>
          <Link href="/owner/shop" className="font-bold text-slate-900 hover:text-[#EC008C]">
            Edit Business Profile
          </Link>
        </div>
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setFilterType("ALL")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "ALL" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Items ({items.length})
          </button>
          <button
            onClick={() => setFilterType("service")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "service" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Custom Services ({items.filter(i => i.item_type === "service").length})
          </button>
          <button
            onClick={() => setFilterType("product")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filterType === "product" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Ready Products ({items.filter(i => i.item_type === "product").length})
          </button>
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
            No printing services or products found in this category. Click above to add new item specs!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => {
              const isService = item.item_type === "service";
              const stock = Number(item.stock_qty || 0);
              const lowStock = stock <= (item.low_stock_threshold || 10);
              const specs = typeof item.specs_json === 'string' ? JSON.parse(item.specs_json) : (item.specs_json || {});
              const hasModifiers = Object.keys(specs.price_modifiers || {}).length > 0;

              return (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between relative group">
                  <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />

                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isService ? "bg-[#00FFFF]/20 text-slate-900" : "bg-purple-100 text-purple-800"
                        }`}>
                          {isService ? "Custom Service" : "Physical Product"}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900 mt-1">{item.name}</h3>
                        <p className="text-xs font-semibold text-[#EC008C]">
                          {item.price_max ? `₱${Number(item.price).toFixed(2)} – ₱${Number(item.price_max).toFixed(2)}` : `₱${Number(item.price).toFixed(2)}`}
                        </p>
                      </div>

                      {item.image_url && (
                        <img src={item.image_url} alt={item.name} className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0" />
                      )}
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{item.description}</p>
                    )}

                    {/* Stock Management for Products */}
                    {!isService && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">Stock Inventory:</span>
                          <span className={`font-bold ${lowStock ? "text-rose-600" : "text-emerald-600"}`}>
                            {stock} units {lowStock && "(Low Stock)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={stockDrafts[item.id] ?? stock}
                            onChange={(e) => setStockDrafts((p) => ({ ...p, [item.id]: e.target.value }))}
                            className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold"
                          />
                          <button
                            onClick={() => handleStockUpdate(item, stockDrafts[item.id])}
                            disabled={updatingStock === item.id}
                            className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-bold hover:bg-[#EC008C] transition-colors"
                          >
                            {updatingStock === item.id ? "Saving..." : "Update Stock"}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Stock quantity applies only to ready-made physical products. Custom print services use scheduling and order capacity instead.
                        </p>
                        {(inventoryMovements[item.id] || []).length > 0 && (
                          <div className="pt-2 border-t border-slate-200 space-y-1">
                            <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                              <History size={12} /> Recent inventory activity
                            </p>
                            {(inventoryMovements[item.id] || []).map((movement) => (
                              <div key={movement.id} className="flex justify-between gap-2 text-[11px] text-slate-500">
                                <span>{movement.reason.replace(/_/g, " ")} ({movement.qty_change > 0 ? "+" : ""}{movement.qty_change})</span>
                                <span className="font-semibold text-slate-700">{movement.new_stock_qty} left</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Specs Summary Badges */}
                    {isService && (
                      <div className="space-y-1.5 text-[11px] text-slate-600">
                        {specs.allowed_sizes && specs.allowed_sizes.length > 0 && (
                          <div className="truncate">
                            <strong className="text-slate-800">Sizes:</strong> {specs.allowed_sizes.join(", ")}
                          </div>
                        )}
                        {specs.allowed_materials && specs.allowed_materials.length > 0 && (
                          <div className="truncate">
                            <strong className="text-slate-800">Materials:</strong> {specs.allowed_materials.join(", ")}
                          </div>
                        )}
                        {hasModifiers && (
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            ✓ +₱ Price Modifiers Active
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-4">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={toggling === item.id}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        item.available ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      <Power size={13} /> {item.available ? "Available" : "Disabled"}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModal({ mode: "edit", item })}
                        className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Form */}
      {modal && (
        <ServiceFormModal
          mode={modal.mode}
          initialValues={modal.item}
          forcedType={modal.forcedType}
          businessId={businessId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
