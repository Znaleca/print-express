"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Package, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ServiceFormModal from "@/components/owner/ServiceFormModal";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";

function mergeSpecs(service, rules) {
  const baseSpecs = typeof service?.specs_json === "string"
    ? (() => { try { return JSON.parse(service.specs_json); } catch { return {}; } })()
    : (service?.specs_json || {});
  const merged = {
    allowed_sizes: [...(baseSpecs.allowed_sizes || [])],
    allowed_materials: [...(baseSpecs.allowed_materials || [])],
    quality_levels: [...(baseSpecs.quality_levels || [])],
    price_modifiers: { ...(baseSpecs.price_modifiers || {}) },
    default_size: baseSpecs.default_size || null,
    default_material: baseSpecs.default_material || null,
    default_quality: baseSpecs.default_quality || null,
    size_chart: Array.isArray(baseSpecs.size_chart) ? baseSpecs.size_chart : [],
    is_customizable: baseSpecs.is_customizable !== false,
  };

  (rules || []).forEach((rule) => {
    const key = rule.option_type === "SIZE"
      ? "allowed_sizes"
      : rule.option_type === "MATERIAL"
        ? "allowed_materials"
        : "quality_levels";
    if (!merged[key].includes(rule.option_name)) merged[key].push(rule.option_name);
    merged.price_modifiers[rule.option_name] = Number(rule.price_modifier || 0);
    if (rule.is_default) {
      if (key === "allowed_sizes") merged.default_size = rule.option_name;
      if (key === "allowed_materials") merged.default_material = rule.option_name;
      if (key === "quality_levels") merged.default_quality = rule.option_name;
    }
  });

  return merged;
}

export default function ServiceEditorPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params?.id;
  const isCreate = itemId === "new" || itemId === "new-service" || itemId === "new-product";
  const forcedType = itemId === "new-product" ? "product" : "service";
  const [businessId, setBusinessId] = useState(null);
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (businessError || !business) {
        if (active) {
          setPageError(businessError?.message || "No active shop profile found.");
          setLoading(false);
        }
        return;
      }

      if (!active) return;
      setBusinessId(business.id);

      if (isCreate) {
        setLoading(false);
        return;
      }

      const [{ data: service, error: serviceError }, { data: rules }] = await Promise.all([
        supabase.from("services").select("*").eq("id", itemId).eq("business_id", business.id).single(),
        supabase.from("service_pricing_rules").select("*").eq("service_id", itemId).eq("business_id", business.id),
      ]);

      if (!active) return;
      if (serviceError || !service) {
        setPageError(serviceError?.message || "This catalog item could not be found.");
      } else {
        setInitialValues({ ...service, specs_json: mergeSpecs(service, rules) });
      }
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, [isCreate, itemId, router]);

  const handleSave = async (values) => {
    if (!businessId) throw new Error("No active shop profile found for your account.");

    const safeStockQty = values.item_type === "product"
      ? Math.max(0, Number.parseInt(values.stock_qty || "0", 10))
      : 0;
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

    let serviceId = isCreate ? null : itemId;
    if (isCreate) {
      const { data: created, error } = await supabase.from("services").insert(mainPayload).select("id").single();
      if (error) throw new Error(error.message || "Failed to create item.");
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
      const { error } = await supabase.from("services").update(mainPayload).eq("id", serviceId).eq("business_id", businessId);
      if (error) throw new Error(error.message || "Failed to update item.");
    }

    const specs = values.specs_json || {};
    const modifiers = specs.price_modifiers || {};
    const { error: deleteRulesError } = await supabase.from("service_pricing_rules").delete().eq("service_id", serviceId).eq("business_id", businessId);
    if (deleteRulesError) throw new Error(`Could not update printable options: ${deleteRulesError.message}`);

    const rulesToInsert = [];
    (specs.allowed_sizes || []).forEach((option) => rulesToInsert.push({ business_id: businessId, service_id: serviceId, option_type: "SIZE", option_name: option, price_modifier: modifiers[option] || 0, is_default: specs.default_size === option, sort_order: rulesToInsert.length }));
    (specs.allowed_materials || []).forEach((option) => rulesToInsert.push({ business_id: businessId, service_id: serviceId, option_type: "MATERIAL", option_name: option, price_modifier: modifiers[option] || 0, is_default: specs.default_material === option, sort_order: rulesToInsert.length }));
    (specs.quality_levels || []).forEach((option) => rulesToInsert.push({ business_id: businessId, service_id: serviceId, option_type: "QUALITY", option_name: option, price_modifier: modifiers[option] || 0, is_default: specs.default_quality === option, sort_order: rulesToInsert.length }));

    if (rulesToInsert.length > 0) {
      const { error } = await supabase.from("service_pricing_rules").insert(rulesToInsert);
      if (error) throw new Error(`Could not save printable options: ${error.message}`);
    }
  };

  if (loading) return <OwnerPageSkeleton rows={5} />;

  if (pageError) {
    return (
      <main className="min-h-screen bg-[#F6F6F2] px-4 py-10 text-slate-900 sm:px-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-black">Could not open this item</h1>
          <p className="mt-2 text-sm text-slate-500">{pageError}</p>
          <Link href="/owner/services" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-3 text-xs font-bold text-white hover:bg-[#EC008C]"><ArrowLeft size={15} /> Back to catalog</Link>
        </div>
      </main>
    );
  }

  const title = isCreate ? (forcedType === "product" ? "Add ready product" : "Add custom service") : "Edit catalog item";
  const editorType = isCreate ? forcedType : (initialValues?.item_type || "service");
  const description = isCreate
    ? "Add the item customers will see in your shop. Choose the category first so the right size list appears."
    : "Update the customer-facing details, available sizes, pricing, and inventory in one simple flow.";

  return (
    <main className="min-h-screen bg-[#F4F5F3] pb-16 font-sans text-slate-900">
      <div className="cmyk-bar" />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/owner/services" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-[#EC008C]"><ArrowLeft size={15} /> Back to catalog</Link>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{isCreate ? "New item" : "Editing item"}</span>
        </div>

        <header className="mt-7 flex items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#009FA0]">Catalog editor</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
          </div>
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-[#00FFFF] sm:flex">
            {editorType === "product" ? <Package size={22} /> : <Plus size={22} />}
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-4">
          {[
            ["1", "Details", "Name, category, image"],
            ["2", "Sizes", "Only the sizes you offer"],
            ["3", "Price & stock", "Base price and inventory"],
            ["4", "Extras", "Materials and quality"],
          ].map(([number, label, hint]) => (
            <div key={number} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-[#00FFFF]">{number}</span>
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-900">{label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500">{hint}</span>
              </span>
              <CheckCircle2 size={15} className="ml-auto shrink-0 text-slate-300" />
            </div>
          ))}
        </div>

        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <ServiceFormModal
            embedded
            mode={isCreate ? "create" : "edit"}
            initialValues={initialValues}
            forcedType={isCreate ? forcedType : undefined}
            businessId={businessId}
            onSave={handleSave}
            onClose={() => router.push("/owner/services")}
          />
        </section>
      </div>
    </main>
  );
}
