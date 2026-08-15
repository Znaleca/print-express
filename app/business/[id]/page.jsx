"use client";

import { useState, useEffect, use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import {
  UploadCloud, CheckCircle2, CreditCard,
  FileText, Star, MapPin, Loader2, ArrowRight,
  ChevronRight, Info, AlertTriangle, MessageSquare, Package, Minus, Plus, Clock, X, Power, ShieldCheck
} from "lucide-react";

const MAX_DESIGN_FILES = 5;
const MAX_DESIGN_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DESIGN_IMAGE_BYTES = 5 * 1024 * 1024;

function getDesignFiles(item) {
  if (Array.isArray(item?.designFiles) && item.designFiles.length > 0) return item.designFiles;
  if (item?.designUrl) return [{ url: item.designUrl, name: item.designFileName || "Design file" }];
  return [];
}

function getCartGroups(items) {
  return [
    { key: "services", label: "Services", items: items.filter((item) => item.item_type !== "product") },
    { key: "products", label: "Products", items: items.filter((item) => item.item_type === "product") },
  ].filter((group) => group.items.length > 0);
}

function getCartItemKey(item) {
  return item.cart_item_id || `${item.id}${JSON.stringify(item.selected_specs || {})}`;
}

export default function BusinessDetailsPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const checkoutServiceId = searchParams.get("checkout_service");
  const quoteAmount = searchParams.get("quote");
  const quoteId = searchParams.get("quote_id");
  const designUrl = searchParams.get("design_url");
  const designVersion = searchParams.get("design_version");

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  // User state
  const [user, setUser] = useState(null);
  const [isCustomer, setIsCustomer] = useState(false);

  // Form & Cart state
  const [selectedServices, setSelectedServices] = useState([]);
  const [cartInitialized, setCartInitialized] = useState(false);

  useEffect(() => {
    if (cartInitialized && typeof window !== "undefined") {
      localStorage.setItem(`cart_${id}`, JSON.stringify(selectedServices));
    }
  }, [selectedServices, cartInitialized, id]);

  const [previewImage, setPreviewImage] = useState(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [inquiryModalService, setInquiryModalService] = useState(null);
  
  // Printing Specs Customizer Modal State
  const [specModalItem, setSpecModalItem] = useState(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [designFiles, setDesignFiles] = useState([]);
  const [designUploadError, setDesignUploadError] = useState("");
  const [designUploading, setDesignUploading] = useState(false);
  const [designFilesToView, setDesignFilesToView] = useState(null);

  const openSpecCustomizer = (svc) => {
    setSpecModalItem(svc);
    const specs = svc.specs_json || {};
    const defaultSz = specs.default_size || (specs.allowed_sizes && specs.allowed_sizes[0]) || "";
    const defaultMat = specs.default_material || (specs.allowed_materials && specs.allowed_materials[0]) || "";
    const defaultQual = specs.default_quality || (specs.quality_levels && specs.quality_levels[0]) || "";

    setSelectedSize(defaultSz);
    setSelectedMaterial(defaultMat);
    setSelectedQuality(defaultQual);
    setCustomNotes("");
    setDesignFiles([]);
    setDesignUploadError("");
    
    const existing = selectedServices.find(s => s.id === svc.id);
    setQuantityInput(String(existing?.quantity || 1));
  };

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user && user.user_metadata?.role === "CUSTOMER") {
        setIsCustomer(true);
      }

      if (id) {
        const { data, error } = await supabase
          .from("businesses")
          .select(`
            id, name, address, description, products_summary, min_downpayment_percent, qr_url, is_open,
            services ( id, name, price, price_max, item_type, description, category, available, image_url, stock_qty, is_customizable, specs_json )
          `)
          .eq("id", id)
          .eq("status", "APPROVED")
          .single();

        if (!error && data) {
          data.services = (data.services || []).filter(s => s.available);

          // Keep the business query small and avoid relying on a nested view
          // relationship, which can fail when the view is recreated in Supabase.
          const { data: reviewRows } = await supabase
            .from("business_reviews")
            .select("order_id, rating, feedback, created_at, customer_name, item_name")
            .eq("business_id", id)
            .order("created_at", { ascending: false });
          const allReviews = reviewRows || [];
          const visibleReviews = allReviews.filter(r => !!r.feedback);
          data.reviewCount = visibleReviews.length;
          data.ratingAvg = data.reviewCount > 0 
            ? (visibleReviews.reduce((sum, r) => sum + r.rating, 0) / data.reviewCount).toFixed(1)
            : "5.0";
          data.reviews = visibleReviews.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

          // Compute best seller ranking
          const orderCountByName = {};
          allReviews.forEach(r => {
            if (r.item_name) {
              orderCountByName[r.item_name] = (orderCountByName[r.item_name] || 0) + 1;
            }
          });
          const sortedByOrders = Object.entries(orderCountByName)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
          data.bestSellerNames = new Set(sortedByOrders);

          setBusiness(data);

          let existingCart = [];
          if (typeof window !== "undefined") {
            const savedCart = localStorage.getItem(`cart_${id}`);
            if (savedCart) {
              try { existingCart = JSON.parse(savedCart); } catch(e) {}
            }
          }

          existingCart = existingCart.map((item) => {
            const service = data.services.find((candidate) => candidate.id === item.id);
            const merged = { ...(service || {}), ...item };
            return {
              ...merged,
              name: merged.name || service?.name || merged.item_name || merged.service_name || "Print item",
              image_url: merged.image_url || service?.image_url || null,
              designFiles: Array.isArray(merged.designFiles)
                ? merged.designFiles
                : (merged.designUrl || merged.design_url)
                  ? [{
                      url: merged.designUrl || merged.design_url,
                      name: merged.designFileName || merged.design_file_name || "Design file",
                    }]
                  : [],
              designUrl: merged.designUrl || merged.design_url || merged.designFiles?.[0]?.url || null,
              designFileName: merged.designFileName || merged.design_file_name || merged.designFiles?.[0]?.name || null,
            };
          });

          if (checkoutServiceId) {
            const svc = data.services.find(s => s.id === checkoutServiceId);
            if (svc && quoteAmount) {
              const exists = existingCart.some(item => item.id === svc.id && item.isQuotedCheckout && item.price === quoteAmount && item.sourceMessageId === quoteId);
              if (!exists) {
                existingCart.push({ 
                  ...svc, 
                  quantity: 1, 
                  price: quoteId ? quoteAmount : svc.price,
                  isQuotedCheckout: Boolean(quoteId),
                  sourceMessageId: quoteId,
                  designUrl: designUrl,
                  designVersion: designVersion
                });
              }
            }

            if (typeof window !== "undefined") {
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.delete("checkout_service");
              currentUrl.searchParams.delete("quote");
              currentUrl.searchParams.delete("design_url");
              currentUrl.searchParams.delete("design_version");
              currentUrl.searchParams.delete("quote_id");
              window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
            }
          }
          setSelectedServices(existingCart);
          setCartInitialized(true);
        }
      }
      setLoading(false);
    }
    init();
  }, [id, checkoutServiceId, quoteAmount, quoteId, designUrl, designVersion]);

  const cartItemCount = useMemo(
    () => selectedServices.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [selectedServices]
  );

  const cartSubtotal = useMemo(
    () => selectedServices.reduce((total, item) => total + Number(item.price || 0) * (Number(item.quantity) || 0), 0),
    [selectedServices]
  );

  const getSelectedQty = (serviceId) =>
    selectedServices
      .filter((s) => s.id === serviceId)
      .reduce((total, item) => total + (Number(item.quantity) || 0), 0);

  const upsertServiceQuantity = (svc, qty) => {
    setSelectedServices((prev) => {
      const matchKey = getCartItemKey(svc);
      const maxQuantity = svc.item_type === "product"
        ? Math.max(0, Number(svc.stock_qty || 0))
        : Infinity;
      const nextQuantity = Math.min(maxQuantity, Math.max(0, Number(qty) || 0));
      const existing = prev.find((s) => getCartItemKey(s) === matchKey);
      
      if (nextQuantity <= 0) return prev.filter((s) => getCartItemKey(s) !== matchKey);
      if (!existing) return [...prev, { ...svc, quantity: nextQuantity, cart_item_id: matchKey }];
      
      return prev.map((s) => getCartItemKey(s) === matchKey ? { ...s, quantity: nextQuantity } : s);
    });
  };

  const clearCart = () => {
    if (selectedServices.length === 0) return;
    if (window.confirm("Clear all items from this cart?")) {
      setSelectedServices([]);
    }
  };

  const handleDesignFileChange = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    setDesignUploadError("");

    if (incomingFiles.length === 0) {
      return;
    }

    const oversizedFile = incomingFiles.find((file) => file.size > MAX_DESIGN_FILE_BYTES);
    if (oversizedFile) {
      setDesignUploadError(`${oversizedFile.name} is too large. Each file must be 10 MB or smaller.`);
      event.target.value = "";
      return;
    }

    const uniqueIncomingFiles = incomingFiles.filter((file) => (
      !designFiles.some((existing) => (
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
      ))
    ));
    const combinedFiles = [...designFiles, ...uniqueIncomingFiles];

    if (combinedFiles.length > MAX_DESIGN_FILES) {
      setDesignUploadError(`You can attach up to ${MAX_DESIGN_FILES} files per custom service.`);
    }

    setDesignFiles(combinedFiles.slice(0, MAX_DESIGN_FILES));
    event.target.value = "";
  };

  const handleAddCustomizedService = async () => {
    if (!specModalItem || designUploading) return;

    const isProduct = specModalItem.item_type === "product";
    const requiresDesignUpload = !isProduct;
    if (requiresDesignUpload && designFiles.length === 0) {
      setDesignUploadError("Upload your design file before adding this custom service.");
      return;
    }

    if (designFiles.length > 0 && !user) {
      setDesignUploadError("Please sign in before uploading a design file.");
      return;
    }

    setDesignUploading(true);
    setDesignUploadError("");

    try {
      const uploadedDesigns = [];

      for (const [fileIndex, designFile] of designFiles.entries()) {
        const isImage = designFile.type?.startsWith("image/");
        const uploadFile = isImage
          ? await optimizeImageForUpload(designFile, { maxBytes: MAX_DESIGN_IMAGE_BYTES })
          : designFile;
        const maxBytes = isImage ? MAX_DESIGN_IMAGE_BYTES : MAX_DESIGN_FILE_BYTES;
        if (uploadFile.size > maxBytes) {
          throw new Error(isImage
            ? `${designFile.name} is still larger than 5 MB after compression.`
            : `${designFile.name} is larger than 10 MB.`);
        }

        const rawExtension = isImage
          ? getUploadExtension(uploadFile)
          : (designFile.name.split(".").pop()?.toLowerCase() || "bin");
        const extension = rawExtension.replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin";
        const storageBucket = isImage ? IMAGE_BUCKET : "chat-images";
        const filePath = `designs/${user.id}/${specModalItem.id}-${Date.now()}-${fileIndex}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(storageBucket)
          .upload(filePath, uploadFile, {
            upsert: false,
            cacheControl: "31536000",
            contentType: uploadFile.type || "application/octet-stream",
          });

        if (uploadError) throw new Error(`Could not upload ${designFile.name}: ${uploadError.message}`);

        const { data: publicData } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
        if (!publicData?.publicUrl) throw new Error(`The file ${designFile.name} uploaded but could not be linked to the order.`);

        uploadedDesigns.push({
          url: publicData.publicUrl,
          name: designFile.name,
          type: uploadFile.type || designFile.type || "application/octet-stream",
          size: uploadFile.size,
        });
      }

      const specs = specModalItem.specs_json || {};
      const modifiers = specs.price_modifiers || {};
      const basePrice = Number(specModalItem.price || 0);
      const sizeAddon = isProduct ? 0 : Number(modifiers[selectedSize] || 0);
      const materialAddon = isProduct ? 0 : Number(modifiers[selectedMaterial] || 0);
      const qualityAddon = isProduct ? 0 : Number(modifiers[selectedQuality] || 0);
      const unitPrice = basePrice + sizeAddon + materialAddon + qualityAddon;
      const requestedQty = Math.max(1, parseInt(quantityInput, 10) || 1);
      const stockLimit = isProduct ? Math.max(1, Number(specModalItem.stock_qty || 0)) : Infinity;
      const qty = Math.min(stockLimit, requestedQty);
      const noteValue = customNotes.trim() || null;
      const selectedSpecs = isProduct
        ? (noteValue ? { notes: noteValue } : null)
        : {
            size: selectedSize || null,
            material: selectedMaterial || null,
            quality: selectedQuality || null,
            notes: noteValue,
          };
      const cartItem = {
        ...specModalItem,
        price: unitPrice,
        base_price: basePrice,
        quantity: qty,
        selected_specs: selectedSpecs,
        designFiles: isProduct ? [] : uploadedDesigns,
        designUrl: uploadedDesigns[0]?.url || null,
        designFileName: uploadedDesigns[0]?.name || null,
        designFileType: uploadedDesigns[0]?.type || null,
        designFileSize: uploadedDesigns[0]?.size || null,
      };

      const matchKey = isProduct
        ? `${specModalItem.id}-product-${noteValue || "no-note"}`
        : specModalItem.id + JSON.stringify(selectedSpecs);
      cartItem.cart_item_id = matchKey;

      setSelectedServices((prev) => {
        const existingIndex = prev.findIndex((item) => (
          isProduct
            ? item.id === specModalItem.id && item.item_type === "product" && (item.selected_specs?.notes || null) === noteValue
            : (item.cart_item_id || item.id + JSON.stringify(item.selected_specs || {})) === matchKey
        ));
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: isProduct
              ? Math.min(stockLimit, updated[existingIndex].quantity + qty)
              : updated[existingIndex].quantity + qty,
            ...(uploadedDesigns.length > 0 ? {
              designFiles: uploadedDesigns,
              designUrl: uploadedDesigns[0].url,
              designFileName: uploadedDesigns[0].name,
              designFileType: uploadedDesigns[0].type,
              designFileSize: uploadedDesigns[0].size,
            } : {}),
          };
          return updated;
        }
        return [...prev, cartItem];
      });

      setSpecModalItem(null);
    } catch (error) {
      setDesignUploadError(error.message || "Could not add this service to your cart.");
    } finally {
      setDesignUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-slate-50 text-slate-600 font-sans">
        <Loader2 className="animate-spin mb-4 text-[#EC008C]" size={40} />
        <p className="text-xs font-semibold uppercase tracking-wider">Loading shop details...</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-slate-50 p-6">
         <div className="bg-white border border-slate-200 rounded-2xl p-10 text-slate-900 max-w-lg w-full shadow-xl relative overflow-hidden">
            <div className="cmyk-bar absolute top-0 left-0 right-0" />
            <AlertTriangle size={40} className="mb-4 text-rose-500" />
            <h1 className="text-2xl font-bold tracking-tight mb-2">Print Shop Not Found</h1>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">The requested shop does not exist or is currently unverified.</p>
            <Link href="/browse" className="inline-block px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-colors">
              Return to Browse Shops
            </Link>
         </div>
      </div>
    );
  }

  const isClosed = business.is_open === false;

  return (
    <main className="business-page min-h-screen bg-[#F6F6F2] pb-24 font-sans">
      
      {/* Shop Header Banner */}
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-9 text-white sm:px-8 sm:pb-12 sm:pt-11 lg:px-12">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-8 left-10 hidden h-16 w-16 rotate-12 border border-[#00FFFF]/30 sm:block" />

        <div className="relative mx-auto max-w-6xl space-y-6">
          
          {/* Closed Status Notification */}
          {isClosed && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#FFF200]/30 bg-[#FFF200]/10 p-4 text-xs font-medium text-[#FFF200]">
              <Power size={18} className="shrink-0" />
              <span>This shop is currently <strong>CLOSED</strong>. Services can be browsed, but new order submissions are temporarily paused.</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-4xl">
              <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
                {business.name}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-white/70">
                  <MapPin size={14} className="text-[#EC008C]" /> {business.address}
                </span>

                <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-bold text-white">
                  <Star size={14} className="fill-[#FFF200] text-[#FFF200]" />
                  <span>{business.ratingAvg}</span>
                  <span className="font-normal text-white/50">({business.reviewCount} reviews)</span>
                </div>

                <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                  !isClosed ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/60"
                }`}>
                  {!isClosed ? "Open for orders" : "Closed"}
                </span>
              </div>
            </div>

            {/* Direct Message Action */}
            {isCustomer && (
              <Link
                href={`/messages?business=${business.id}&greet=1`}
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-[#00FFFF] px-6 py-3.5 text-xs font-black text-[#1A1A1A] shadow-md transition-all hover:bg-[#FFF200]"
              >
                <MessageSquare size={16} />
                Message Shop
                <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {(business.description || business.products_summary) && (
            <div className="grid max-w-5xl grid-cols-1 gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
              {business.description && (
                <div>
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#00FFFF]">About the shop</p>
                  <p className="text-xs leading-relaxed text-white/65 sm:text-sm">{business.description}</p>
                </div>
              )}
              {business.products_summary && (
                <div>
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFF200]">What we offer</p>
                  <p className="text-xs leading-relaxed text-white/65 sm:text-sm">{business.products_summary}</p>
                </div>
              )}
            </div>
          )}

        </div>
      </section>

      {/* Main Content Layout */}
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-8 lg:px-12">
        
        {/* BEST SELLERS HIGHLIGHT */}
        {(() => {
          const allItems = business.services || [];
          const allReviews = business.reviews || [];
          const orderCountByName = {};
          allReviews.forEach(r => {
            if (r.item_name) orderCountByName[r.item_name] = (orderCountByName[r.item_name] || 0) + 1;
          });
          const top3 = Object.entries(orderCountByName)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => ({ item: allItems.find(s => s.name === name), name, count }))
            .filter(x => x.item);

          if (top3.length === 0) return null;

          return (
            <section className="relative mb-10 overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-7">
              <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />
              <h2 className="mb-4 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#676762]">
                <Star size={14} className="fill-[#FFF200] text-[#D6C900]" /> Popular services & products
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {top3.map(({ item, name, count }, i) => (
                  <div
                    key={item.id}
                    onClick={() => openItemDetails(item)}
                    className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#D8D6CE] bg-[#F6F6F2] p-4 transition-all hover:border-[#EC008C]/50 hover:bg-white"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {item.image_url ? (
                        <Image src={item.image_url} alt={name} fill sizes="48px" className="object-cover" />
                      ) : (
                        <Package size={20} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-slate-900 truncate group-hover:text-[#EC008C] transition-colors">
                        {name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        ₱{Number(item.price).toFixed(2)} • {count} {count === 1 ? "order" : "orders"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          {/* LEFT COLUMN: SERVICES & PRODUCTS */}
          <div className="lg:col-span-2 space-y-10">

            {/* SERVICES */}
            {business.services.filter(s => s.item_type !== "product").length > 0 && (
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-900">
                  <span>Printing Services</span>
                  <span className="text-xs text-slate-400 font-normal">({business.services.filter(s => s.item_type !== "product").length})</span>
                </h2>

                <div className="border-y border-[#D8D6CE]">
                  {business.services.filter(s => s.item_type !== "product").map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    return (
                      <button
                        type="button"
                        key={svc.id}
                        onClick={() => openSpecCustomizer(svc)}
                        className={`group flex w-full items-center gap-4 border-b border-[#D8D6CE] py-5 text-left transition-colors last:border-b-0 hover:bg-white/70 ${
                          isSelected ? "bg-[#00FFFF]/[0.04]" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                              {svc.category || "General"}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#009FA0]">
                                In cart · {getSelectedQty(svc.id)}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h3 className="truncate font-bold text-base text-slate-900 transition-colors group-hover:text-[#EC008C]">
                              {svc.name}
                            </h3>
                            <p className="shrink-0 text-sm font-extrabold text-slate-900">
                              {svc.price_max && parseFloat(svc.price_max) > parseFloat(svc.price)
                                ? `₱${Number(svc.price).toFixed(2)} – ₱${Number(svc.price_max).toFixed(2)}`
                                : `From ₱${Number(svc.price).toFixed(2)}`}
                            </p>
                          </div>

                          {svc.description && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{svc.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <UploadCloud size={14} className="text-[#009FA0]" />
                            Made to order · design upload required
                          </div>
                        </div>

                        <ChevronRight size={18} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#EC008C]" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PRODUCTS */}
            {business.services.filter(s => s.item_type === "product").length > 0 && (
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-900">
                  <span>Available Products</span>
                  <span className="text-xs text-slate-400 font-normal">({business.services.filter(s => s.item_type === "product").length})</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {business.services.filter(s => s.item_type === "product").map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    const stockLeft = Math.max(0, Number(svc.stock_qty || 0));
                    const outOfStock = stockLeft <= 0;

                    return (
                      <div
                        key={svc.id}
                        onClick={() => {
                          if (!outOfStock) openSpecCustomizer(svc);
                        }}
                        className={`relative flex cursor-pointer flex-col justify-between rounded-3xl border bg-white p-5 transition-all group hover:-translate-y-1 hover:shadow-xl ${
                          isSelected ? "border-[#EC008C] ring-2 ring-[#EC008C]/20 shadow-sm" : "border-slate-200 hover:border-slate-300 shadow-sm"
                        } ${outOfStock ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {svc.category || "General"}
                            </span>
                            {outOfStock ? (
                              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold">
                                Out of Stock
                              </span>
                            ) : isSelected && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                In Cart ({getSelectedQty(svc.id)})
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-base text-slate-900 group-hover:text-[#EC008C] transition-colors mb-1">
                            {svc.name}
                          </h3>

                          <p className="text-sm font-extrabold text-slate-900 mb-3">
                            ₱{Number(svc.price).toFixed(2)}
                          </p>

                          {svc.image_url ? (
                            <div className="relative h-40 w-full overflow-hidden rounded-2xl border border-[#ECECE8] bg-[#F6F6F2] p-2">
                              <Image
                                src={svc.image_url}
                                alt={svc.name}
                                fill
                                sizes="(max-width: 640px) 100vw, 360px"
                                className="object-contain transition-transform group-hover:scale-105"
                              />
                            </div>
                          ) : (
                            <div className="flex h-40 w-full items-center justify-center rounded-2xl border border-[#ECECE8] bg-[#F6F6F2] text-slate-400">
                              <Package size={28} />
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* REVIEWS */}
            <section className="rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8">
              <h3 className="mb-6 flex items-center gap-2 text-xl font-black text-slate-900">
                <Star size={18} className="fill-[#FFF200] text-[#D6C900]" /> Customer reviews ({business.reviewCount})
              </h3>

              {(business.reviews || []).length > 0 ? (
                <div className="space-y-4">
                  {business.reviews.slice(0, 6).map((review) => (
                    <article key={review.order_id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-bold text-xs text-slate-900">{review.customer_name || "Customer"}</span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              size={12}
                              className={idx < review.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 italic">"{review.feedback}"</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic text-center py-6">No customer reviews yet for this print shop.</p>
              )}
            </section>

          </div>

          {/* RIGHT COLUMN: CART & CHECKOUT SUMMARY */}
          <aside className="space-y-6 lg:sticky lg:top-6 lg:h-fit">

            {/* Cart Summary Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-md relative overflow-hidden">
              <div className="cmyk-bar absolute top-0 left-0 right-0" />
              
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Your cart</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">{cartItemCount} {cartItemCount === 1 ? "item" : "items"}</p>
                </div>
                {selectedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-rose-500"
                  >
                    Clear cart
                  </button>
                )}
              </div>

              {selectedServices.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Your cart is empty. Select services or products above to proceed.
                </div>
              ) : (
                <div className="mb-6 space-y-5">
                  {getCartGroups(selectedServices).map((group) => (
                    <section key={group.key}>
                      <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {group.label}
                      </h3>
                      <div className="space-y-4">
                        {group.items.map((s) => (
                    <div key={getCartItemKey(s)} className="flex justify-between items-start text-xs pb-3 border-b border-slate-100 last:border-0">
                      <div className={`flex min-w-0 items-start ${s.item_type === "product" ? "gap-3" : ""}`}>
                        {s.item_type === "product" && (
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            {s.image_url ? (
                              <Image src={s.image_url} alt={s.name || "Print item"} fill sizes="56px" className="object-cover" />
                            ) : (
                              <Package className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            )}
                          </div>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-semibold text-slate-900">{s.name || s.item_name || s.service_name || "Print item"}</p>
                        <p className="text-slate-400 text-[11px]">Qty: {s.quantity || 1}</p>
                        
                        {s.selected_specs && (s.selected_specs.size || s.selected_specs.material || s.selected_specs.quality || s.selected_specs.notes) && (
                          <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 space-y-0.5">
                            {s.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-800">{s.selected_specs.size}</span></div>}
                            {s.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-800">{s.selected_specs.material}</span></div>}
                            {s.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-800">{s.selected_specs.quality}</span></div>}
                            {s.selected_specs.notes && <div className="text-amber-800 italic truncate">"Notes: {s.selected_specs.notes}"</div>}
                          </div>
                        )}
                        {getDesignFiles(s).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDesignFilesToView(getDesignFiles(s))}
                            className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#009FA0] hover:text-[#EC008C]"
                          >
                            <FileText size={13} /> View files ({getDesignFiles(s).length})
                          </button>
                        )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="font-bold text-slate-900">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => upsertServiceQuantity(s, (s.quantity || 1) - 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                            aria-label={`Decrease ${s.name || "item"} quantity`}
                          >
                            <Minus size={12} />
                          </button>
                          <span className="min-w-5 text-center text-[10px] font-bold text-slate-700">{s.quantity || 1}</span>
                          <button
                            type="button"
                            onClick={() => upsertServiceQuantity(s, (s.quantity || 1) + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                            aria-label={`Increase ${s.name || "item"} quantity`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => upsertServiceQuantity(s, 0)}
                          className="text-[10px] font-semibold text-slate-400 transition-colors hover:text-rose-500"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600">Estimated Total</span>
                  <span className="text-2xl font-extrabold text-slate-900">
                    ₱{cartSubtotal.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => router.push(`/checkout/${business.id}`)}
                  disabled={selectedServices.length === 0 || isClosed}
                  className="w-full bg-slate-900 text-white py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50"
                >
                  Proceed to Checkout <ArrowRight size={16} />
                </button>
              </div>
            </div>

          </aside>
        </div>

      </div>

      {/* PRINT SPECIFICATIONS & CUSTOMIZER MODAL */}
      {specModalItem && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setSpecModalItem(null)}>
          <div className="dialog-surface relative max-h-[90vh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="cmyk-bar" />
            <button
              onClick={() => setSpecModalItem(null)}
              className="absolute right-4 top-5 p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
            >
              <X size={20} />
            </button>

            {(() => {
              const isProduct = specModalItem.item_type === "product";
              const specs = specModalItem.specs_json || {};
              const modifiers = specs.price_modifiers || {};
              const basePrice = Number(specModalItem.price || 0);
              const sizeAddon = isProduct ? 0 : Number(modifiers[selectedSize] || 0);
              const materialAddon = isProduct ? 0 : Number(modifiers[selectedMaterial] || 0);
              const qualityAddon = isProduct ? 0 : Number(modifiers[selectedQuality] || 0);

              const unitPrice = basePrice + sizeAddon + materialAddon + qualityAddon;
              const stockLimit = isProduct ? Math.max(1, Number(specModalItem.stock_qty || 0)) : Infinity;
              const qty = Math.min(stockLimit, Math.max(1, parseInt(quantityInput, 10) || 1));
              const totalPrice = unitPrice * qty;
              const requiresDesignUpload = !isProduct;

              return (
                <div className="p-6 sm:p-7 space-y-5">
                  <div className={`flex items-start ${isProduct ? "gap-4" : ""}`}>
                    {isProduct && (
                      specModalItem.image_url ? (
                        <Image src={specModalItem.image_url} alt={specModalItem.name} width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                          <Package size={24} />
                        </div>
                      )
                    )}
                    <div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        {specModalItem.category || "General Printing"}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 mt-1">{specModalItem.name}</h3>
                      <p className="text-xs text-slate-500">{isProduct ? "Ready-Made Physical Product" : "Made to Order Custom Service"}</p>
                    </div>
                  </div>

                  {isProduct && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs leading-relaxed text-slate-600">
                        {specModalItem.description || "A ready-made product you can add directly to your cart."}
                      </p>
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">
                        {Math.max(0, Number(specModalItem.stock_qty || 0))} available in stock
                      </p>
                    </div>
                  )}

                  {requiresDesignUpload && (
                    <div className="rounded-2xl border border-[#00FFFF]/40 bg-[#00FFFF]/[0.06] p-4">
                      <div className="flex items-start gap-3">
                        <UploadCloud size={18} className="mt-0.5 shrink-0 text-[#009FA0]" />
                        <div className="min-w-0 flex-1">
                          <label htmlFor="design-file" className="block text-xs font-bold text-slate-900">
                            Upload your design file <span className="text-[#EC008C]">Required</span>
                          </label>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Add up to 5 files. Images are compressed to 5 MB; PDF and design files can be up to 10 MB each.
                          </p>
                        </div>
                      </div>

                      <input
                        id="design-file"
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.ai,.psd,.doc,.docx,image/*,application/pdf"
                        onChange={handleDesignFileChange}
                        className="mt-3 block w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-[11px] file:font-bold file:text-white hover:file:bg-[#EC008C]"
                      />

                      {designFiles.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {designFiles.map((file) => (
                            <div
                              key={`${file.name}-${file.size}-${file.lastModified}`}
                              className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700"
                            >
                              <CheckCircle2 size={14} className="shrink-0 text-[#009FA0]" />
                              <span className="min-w-0 flex-1 truncate">{file.name}</span>
                              <span className="shrink-0 text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                              <button
                                type="button"
                                onClick={() => setDesignFiles((current) => current.filter((item) => item !== file))}
                                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                                aria-label={`Remove ${file.name}`}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {designUploadError && (
                        <p className="mt-2 text-[11px] font-semibold text-rose-600">{designUploadError}</p>
                      )}
                    </div>
                  )}

                  {/* Size Selection */}
                  {!isProduct && specs.allowed_sizes && specs.allowed_sizes.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5">Select Print Size</label>
                      <div className="flex flex-wrap gap-2">
                        {specs.allowed_sizes.map((sz) => {
                          const isSel = selectedSize === sz;
                          const addon = modifiers[sz] || 0;
                          return (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setSelectedSize(sz)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                isSel ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {sz} {addon > 0 && <span className="text-[#00FFFF] font-bold">(+₱{addon})</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Material Selection */}
                  {!isProduct && specs.allowed_materials && specs.allowed_materials.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5">Paper Stock / Material</label>
                      <div className="flex flex-wrap gap-2">
                        {specs.allowed_materials.map((mat) => {
                          const isSel = selectedMaterial === mat;
                          const addon = modifiers[mat] || 0;
                          return (
                            <button
                              key={mat}
                              type="button"
                              onClick={() => setSelectedMaterial(mat)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                isSel ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {mat} {addon > 0 && <span className="text-[#00FFFF] font-bold">(+₱{addon})</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Print Quality */}
                  {!isProduct && specs.quality_levels && specs.quality_levels.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5">Print Quality Resolution</label>
                      <div className="flex flex-wrap gap-2">
                        {specs.quality_levels.map((q) => {
                          const isSel = selectedQuality === q;
                          const addon = modifiers[q] || 0;
                          return (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setSelectedQuality(q)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                isSel ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {q} {addon > 0 && <span className="text-[#00FFFF] font-bold">(+₱{addon})</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Customer Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      {isProduct ? "Order notes" : "Custom artwork / order notes"} <span className="font-medium text-slate-400">(Optional)</span>
                    </label>
                    <textarea
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      placeholder={isProduct
                        ? "e.g. Preferred color, text, or special instructions..."
                        : "e.g. Add 3mm bleed margin, align header logos, or share finishing instructions..."}
                      rows={3}
                      maxLength={500}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-[#EC008C]"
                    />
                    <p className="mt-1 text-right text-[10px] text-slate-400">{customNotes.length}/500</p>
                  </div>

                  {/* Live Calculated Price Breakdown */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Base Unit Price:</span>
                      <span>₱{basePrice.toFixed(2)}</span>
                    </div>
                    {(sizeAddon > 0 || materialAddon > 0 || qualityAddon > 0) && (
                      <div className="flex justify-between text-[#EC008C] font-semibold">
                        <span>Selected Options Modifiers:</span>
                        <span>+₱{(sizeAddon + materialAddon + qualityAddon).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-extrabold text-sm pt-2 border-t border-slate-200">
                      <span>Calculated Unit Price:</span>
                      <span>₱{unitPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Quantity & Cart Action */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Qty:</span>
                      <button
                        type="button"
                        onClick={() => setQuantityInput(String(Math.max(1, (parseInt(quantityInput, 10) || 1) - 1)))}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="w-14 text-center border border-slate-200 rounded-lg py-1 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantityInput(String(Math.min(stockLimit, (parseInt(quantityInput, 10) || 1) + 1)))}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddCustomizedService}
                      disabled={designUploading}
                      className="px-6 py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-[#EC008C] transition-all flex items-center gap-2 shadow-md disabled:cursor-wait disabled:opacity-60"
                    >
                      {designUploading ? "Uploading design…" : `Add to Cart (₱${totalPrice.toFixed(2)})`} <ArrowRight size={16} />
                    </button>
                  </div>

                </div>
              );
            })()}
          </div>
        </div>
      )}

      {designFilesToView && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setDesignFilesToView(null)}>
          <div className="dialog-surface attachment-dialog relative w-full max-w-sm overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="cmyk-bar" />
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#009FA0]">Attachments</p>
                  <h2 className="mt-1 text-lg font-extrabold text-white">Choose a file to view</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDesignFilesToView(null)}
                  className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Close files"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-5 space-y-2">
                {designFilesToView.map((file, fileIndex) => (
                  <a
                    key={`${file.url}-${fileIndex}`}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setDesignFilesToView(null)}
                    className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-white/90 transition-colors hover:border-[#00FFFF] hover:bg-[#00FFFF]/10"
                  >
                    <span className="flex items-center gap-2"><FileText size={16} className="text-[#009FA0]" /> File {fileIndex + 1}</span>
                    <ChevronRight size={16} className="text-white/50" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
