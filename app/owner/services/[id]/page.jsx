"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Package, Plus } from "lucide-react";
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
  const description = isCreate ? "Create a customer-ready item with pricing, images, stock, and printable options." : "Update the item details, pricing, image, inventory, and customer-facing options.";

  return (
    <main className="min-h-screen bg-white pb-20 font-sans text-slate-900">
      <section className="relative overflow-hidden border-b border-[#D8D6CE] bg-white px-4 pb-9 pt-8 text-slate-900 sm:px-8 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="relative mx-auto max-w-[1800px]">
          <Link href="/owner/services" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-[#EC008C]"><ArrowLeft size={15} /> Back to services & products</Link>
          <div className="mt-7 flex items-end justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00FFFF]">Catalog workspace</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight sm:text-5xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</p>
            </div>
            {forcedType === "product" && isCreate && <Package size={42} className="hidden text-[#EC008C] sm:block" />}
            {forcedType === "service" && isCreate && <Plus size={42} className="hidden text-[#00FFFF] sm:block" />}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1800px] bg-white px-3 pt-2 sm:px-6 lg:px-10">
        <div className="border-b border-[#D8D6CE] bg-white">
          <ServiceFormModal
            embedded
            mode={isCreate ? "create" : "edit"}
            initialValues={initialValues}
            forcedType={forcedType}
            businessId={businessId}
            onSave={handleSave}
            onClose={() => router.push("/owner/services")}
          />
        </div>
      </section>
    </main>
  );
}
