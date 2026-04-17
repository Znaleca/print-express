"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  UploadCloud, CheckCircle2, CreditCard, Banknote,
  FileText, Star, MapPin, Loader2, Hash, ArrowRight,
  ChevronRight, Info, AlertTriangle, MessageSquare, Package, Truck, Minus, Plus, Clock, X
} from "lucide-react";
import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const MANILA_TIME_ZONE = "Asia/Manila";

const getManilaParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const manilaDateString = (date = new Date()) => {
  const { year, month, day } = getManilaParts(date);
  return `${year}-${month}-${day}`;
};

const manilaDateTimeString = (date = new Date()) => {
  const { year, month, day, hour, minute } = getManilaParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const addManilaDays = (date, days) => {
  const base = new Date(date.toLocaleString("en-US", { timeZone: MANILA_TIME_ZONE }));
  base.setDate(base.getDate() + days);
  return base;
};

const manilaStartOfTomorrow = () => {
  const tomorrow = addManilaDays(new Date(), 1);
  const { year, month, day } = getManilaParts(tomorrow);
  return `${year}-${month}-${day}T00:00`;
};

const parseManilaDateTime = (value) => {
  if (!value) return null;
  return new Date(`${value}:00+08:00`);
};

export default function BusinessDetailsPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  // User state
  const [user, setUser] = useState(null);
  const [isCustomer, setIsCustomer] = useState(false);

  // Form state
  const [selectedServices, setSelectedServices] = useState([]);
  const [quantityModalService, setQuantityModalService] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [receiptFile, setReceiptFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [deliveryType, setDeliveryType] = useState("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
  const [deliveryLocationLoading, setDeliveryLocationLoading] = useState(true);
  const [fulfillmentMode, setFulfillmentMode] = useState("NEED_NOW");
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");

  // Downpayment state
  const [downpaymentPercent, setDownpaymentPercent] = useState(30);

  useEffect(() => {
    async function init() {
      // Load user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user && user.user_metadata?.role === "CUSTOMER") {
        setIsCustomer(true);
      }

      // Load business
      if (id) {
        const { data, error } = await supabase
          .from("businesses")
          .select(`
            id, name, address, description, min_downpayment_percent,
            services ( id, name, price, description, category, available, image_url, stock_qty ),
            business_reviews ( rating, feedback, created_at, customer_name )
          `)
          .eq("id", id)
          .eq("status", "APPROVED")
          .single();

        if (!error && data) {
          data.services = (data.services || []).filter(s => s.available);
          
          // Inject Reviews Logic from public view
          const reviews = data.business_reviews || [];
          data.reviewCount = reviews.length;
          data.ratingAvg = data.reviewCount > 0 
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / data.reviewCount).toFixed(1)
            : "5.0";
            
          data.reviews = reviews.filter(r => !!r.feedback).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

          const minDp = Math.min(100, Math.max(1, Number.parseInt(String(data.min_downpayment_percent ?? 30), 10) || 30));
          setDownpaymentPercent(minDp);

          setBusiness(data);
        }
      }
      setLoading(false);
    }
    init();
  }, [id]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDeliveryCoordinates({ lat: 14.6806, lng: 120.5375 });
      setDeliveryLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeliveryCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setDeliveryLocationLoading(false);
      },
      () => {
        setDeliveryCoordinates({ lat: 14.6806, lng: 120.5375 });
        setDeliveryLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  const getSelectedQty = (serviceId) =>
    selectedServices.find((s) => s.id === serviceId)?.quantity || 0;

  const upsertServiceQuantity = (svc, qty) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (qty <= 0) return prev.filter((s) => s.id !== svc.id);
      if (!existing) return [...prev, { ...svc, quantity: qty }];
      return prev.map((s) => (s.id === svc.id ? { ...s, quantity: qty } : s));
    });
  };

  const openQuantityModal = (svc) => {
    const currentQty = getSelectedQty(svc.id);
    setQuantityModalService(svc);
    setQuantityInput(String(currentQty > 0 ? currentQty : 1));
  };

  const closeQuantityModal = () => {
    setQuantityModalService(null);
    setQuantityInput("1");
  };

  const applyQuantityToCart = () => {
    if (!quantityModalService) return;
    const maxStock = Math.max(0, Number(quantityModalService.stock_qty || 0));
    if (maxStock <= 0) {
      closeQuantityModal();
      return;
    }
    const parsed = Number.parseInt(quantityInput, 10);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const qty = Math.min(normalized, maxStock);
    upsertServiceQuantity(quantityModalService, qty);
    closeQuantityModal();
  };

  const toggle = (svc) =>
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (existing) return prev.filter((s) => s.id !== svc.id);
      return [...prev, { ...svc, quantity: 1 }];
    });

  const incrementService = (svc) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (!existing) return [...prev, { ...svc, quantity: 1 }];
      return prev.map((s) =>
        s.id === svc.id ? { ...s, quantity: (s.quantity || 1) + 1 } : s
      );
    });
  };

  const decrementService = (svc) => {
    setSelectedServices((prev) => {
      const existing = prev.find((s) => s.id === svc.id);
      if (!existing) return prev;
      const currentQty = existing.quantity || 1;
      if (currentQty <= 1) return prev.filter((s) => s.id !== svc.id);
      return prev.map((s) =>
        s.id === svc.id ? { ...s, quantity: currentQty - 1 } : s
      );
    });
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, name: f.name, id: Date.now() + Math.random() })),
    ]);
  };

  const handleReceiptUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      setReceiptFile(e.target.files[0]);
    }
  };

  const minimumDownpaymentPercent = Math.min(
    100,
    Math.max(1, Number.parseInt(String(business?.min_downpayment_percent ?? 30), 10) || 30)
  );
  const effectiveDownpaymentPercent = Math.max(minimumDownpaymentPercent, Math.min(100, downpaymentPercent));
  const downpaymentOptions = Array.from(
    new Set([10, 20, 30, 50, 100, minimumDownpaymentPercent].filter((pct) => pct >= minimumDownpaymentPercent))
  ).sort((a, b) => a - b);

  const total = selectedServices.reduce((s, x) => s + Number(x.price) * (x.quantity || 1), 0);
  const downpaymentAmount = total * (effectiveDownpaymentPercent / 100);
  const balanceAmount = total - downpaymentAmount;
  const todayInManila = manilaDateString();
  const minAdvanceDateTime = manilaStartOfTomorrow();

  const generateFileName = (fileName) => {
    const ext = fileName.split('.').pop();
    const random = Math.random().toString(36).substring(2, 10);
    return `${Date.now()}_${random}.${ext}`;
  };

  const checkout = async () => {
    if (!user) return alert("You must be logged in to place an order.");
    if (!isCustomer) return alert("Only registered customers can place orders.");
    if (!selectedServices.length) return alert("Please select at least one service.");
    if (!receiptFile) return alert("Please upload your E-Wallet proof of downpayment.");
    if (!uploadedFiles.length) return alert("Please upload design files for proofing.");
    
    if (deliveryType === "DELIVERY") {
      if (!deliveryAddress.trim()) return alert("Please enter your exact delivery address.");
      if (!deliveryCoordinates?.lat || !deliveryCoordinates?.lng) return alert("Please pin your exact location on the map.");
    }

    if (fulfillmentMode === "ADVANCE") {
      if (!expectedFulfillmentAt) return alert("Please set your expected pickup/delivery date and time.");
      const expected = parseManilaDateTime(expectedFulfillmentAt);
      if (Number.isNaN(expected.getTime())) return alert("Expected date/time is invalid.");
      const expectedManilaDay = manilaDateString(expected);
      if (expectedManilaDay <= todayInManila) return alert("Advance orders must be scheduled for a later day in Philippines time.");
    }

    const selectedIds = selectedServices.map((s) => s.id);
    const { data: latestServices, error: stockErr } = await supabase
      .from("services")
      .select("id, stock_qty, name")
      .in("id", selectedIds)
      .eq("business_id", business.id);

    if (stockErr) return alert("Unable to validate stock right now. Please try again.");

    const stockMap = Object.fromEntries((latestServices || []).map((s) => [s.id, s]));
    const outOfStockItem = selectedServices.find((item) => {
      const latest = stockMap[item.id];
      const latestQty = Math.max(0, Number(latest?.stock_qty || 0));
      return (item.quantity || 1) > latestQty;
    });

    if (outOfStockItem) {
      const latest = stockMap[outOfStockItem.id];
      return alert(`${latest?.name || outOfStockItem.name} has only ${Math.max(0, Number(latest?.stock_qty || 0))} stock left.`);
    }

    setIsProcessing(true);

    try {
      const uid = user.id;
      
      // Upload Design Files
      const designFileUrls = [];
      for (const item of uploadedFiles) {
        const filePath = `${uid}/${generateFileName(item.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("order-assets")
          .upload(filePath, item.file);

        if (uploadError) throw new Error("Failed to upload design files: " + uploadError.message);

        const { data: urlData } = supabase.storage
          .from("order-assets")
          .getPublicUrl(filePath);
          
        designFileUrls.push({ name: item.name, url: urlData.publicUrl });
      }

      // Upload Receipt
      let receiptUrl = null;
      if (receiptFile) {
        const filePath = `${uid}/receipt_${generateFileName(receiptFile.name)}`;
        const { error: receiptError } = await supabase.storage
          .from("order-assets")
          .upload(filePath, receiptFile);

        if (receiptError) throw new Error("Failed to upload receipt: " + receiptError.message);

        const { data: urlData } = supabase.storage
          .from("order-assets")
          .getPublicUrl(filePath);
        receiptUrl = urlData.publicUrl;
      }

      // Insert Order
      const { error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: uid,
          business_id: business.id,
          status: "PENDING",
          payment_method: paymentMethod,
          total: total,
          downpayment_amount: downpaymentAmount,
          balance_amount: balanceAmount,
          items: selectedServices.map((s) => ({
            id: s.id,
            name: s.name,
            price: Number(s.price),
            category: s.category || null,
            description: s.description || null,
            quantity: s.quantity || 1,
          })),
          receipt_url: receiptUrl,
          design_files: designFileUrls,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "DELIVERY" ? deliveryAddress : null,
          delivery_coordinates: deliveryType === "DELIVERY" ? deliveryCoordinates : null,
          fulfillment_mode: fulfillmentMode,
          expected_fulfillment_at: fulfillmentMode === "ADVANCE"
            ? parseManilaDateTime(expectedFulfillmentAt).toISOString()
            : null,
        });

      if (orderError) throw new Error("Failed to place order: " + orderError.message);

      alert(`Order placed successfully via ${paymentMethod}! Redirecting to tracking...`);
      router.push("/track");
    } catch (err) {
      console.error(err);
      alert(err.message);
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="uppercase tracking-[0.4em] text-[10px] font-black">Fetching_Node_Data...</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-[#FDFDFD] p-6">
         <div className="bg-[#1A1A1A] border-l-8 border-[#EC008C] p-10 text-white max-w-lg w-full">
            <AlertTriangle size={48} className="mb-6 text-[#EC008C]" />
            <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Node_Not_Found</h1>
            <p className="font-mono text-xs uppercase opacity-50 tracking-widest">Error 404: Access to specified business ID denied or inactive.</p>
         </div>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-80px)] bg-[#FDFDFD] font-sans overflow-x-hidden">
      <section className="relative px-6 pb-24 pt-10 md:px-10 md:pt-12">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative w-full space-y-12">
        {/* ── HEADER SECTION ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b-8 border-[#1A1A1A] pb-10">
          <div>
            <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] mb-5">
              <span className="flex gap-1">
                <span className="h-2 w-2 bg-[#00FFFF]" />
                <span className="h-2 w-2 bg-[#EC008C]" />
                <span className="h-2 w-2 bg-[#FFF200]" />
              </span>
              Unit_Profile_v2.0
            </div>
            <h1 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-6">
              {business.name || "UNNAMED_UNIT"}
            </h1>
            
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2 bg-[#1A1A1A] text-[#00FFFF] px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]">
                <MapPin size={14} className="text-[#EC008C]" /> {business.address}
              </div>
              <div className="flex items-center gap-2 justify-center border-4 border-[#1A1A1A] px-4 py-2 bg-white shadow-[4px_4px_0px_0px_rgba(255,242,0,1)]">
                <Star size={16} fill="#1A1A1A" className="text-[#1A1A1A]" /> 
                <span className="font-black italic text-lg leading-none">{business.ratingAvg}</span>
                <span className="text-[10px] uppercase font-mono opacity-60 not-italic tracking-widest font-bold ml-2 pt-1 border-l-2 border-[#1A1A1A] pl-2">({business.reviewCount} INTEL)</span>
              </div>
              <div className="font-mono text-[10px] uppercase opacity-40 tracking-tighter font-black flex items-center gap-2 mt-2 md:mt-0">
                <Hash size={12} className="text-[#00FFFF]" /> ID: {business.id.split('-')[0]} // STATUS: ONLINE
              </div>
            </div>
          </div>
          {/* Message Button */}
          {isCustomer && (
            <Link
              href={`/messages?business=${business.id}`}
              className="flex items-center gap-3 bg-[#1A1A1A] text-[#00FFFF] px-8 py-5 font-black uppercase italic text-lg border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] hover:bg-[#EC008C] hover:text-white hover:shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] transition-all group shrink-0"
            >
              <MessageSquare size={22} />
              Message_Owner
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>

        <div className="border-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
          <div className="flex items-center gap-6 px-5 font-mono text-[10px] font-black uppercase tracking-[0.35em] text-white md:px-6">
            <span className="text-[#00FFFF]">Cyan</span>
            <span className="text-[#EC008C]">Magenta</span>
            <span className="text-[#FFF200]">Yellow</span>
            <span>Black</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 space-y-16">

            {/* DESCRIPTION */}
            {business.description && (
              <section className="bg-white border-4 border-[#1A1A1A] p-8 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
                <div className="flex items-center gap-2 mb-4 border-b-4 border-[#1A1A1A] pb-4">
                  <Info size={20} className="text-[#EC008C]" />
                  <h3 className="font-black uppercase text-sm tracking-widest italic">Unit_Intel</h3>
                </div>
                <p className="text-zinc-800 leading-relaxed italic text-lg">{business.description}</p>
              </section>
            )}


            {/* SERVICE SELECTION */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-4">
                  <span className="bg-[#FFF200] px-3 py-1 text-[#1A1A1A] not-italic border-4 border-[#1A1A1A]">01</span>
                  Service_Catalog
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {business.services.map((svc) => {
                  const isSelected = selectedServices.some((s) => s.id === svc.id);
                  const stockLeft = Math.max(0, Number(svc.stock_qty || 0));
                  const outOfStock = stockLeft <= 0;
                  return (
                    <div
                      key={svc.id}
                      onClick={() => {
                        if (outOfStock) return;
                        openQuantityModal(svc);
                      }}
                      className={`group relative text-left p-6 border-4 transition-all ${isSelected
                          ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] -translate-y-1"
                          : "bg-white border-[#1A1A1A] hover:bg-[#F9F9F7]"
                        } ${outOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <span className={`font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 ${isSelected ? 'border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]' : 'border-[#1A1A1A] bg-[#1A1A1A] text-white'}`}>
                          {svc.category || "GENERAL"}
                        </span>
                        {isSelected ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-[#00FFFF] text-[#00FFFF]">
                              Qty {getSelectedQty(svc.id)}
                            </span>
                            <CheckCircle2 className="text-[#00FFFF]" size={24} />
                          </div>
                        ) : null}
                      </div>

                      <p className="font-black uppercase italic text-2xl mb-2 leading-tight">{svc.name}</p>
                      {svc.image_url && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ src: svc.image_url, name: svc.name });
                          }}
                          className="mb-4 block w-full"
                          aria-label={`Preview ${svc.name} image`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={svc.image_url}
                            alt={`${svc.name} sample`}
                            className="mx-auto h-56 w-full bg-[#F9F9F7] object-contain p-2 transition-transform hover:scale-[1.01]"
                          />
                        </button>
                      )}
                      <p className={`text-[12px] font-mono uppercase tracking-wide leading-relaxed mb-8 ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                        {svc.description || "NO_DESCRIPTION_AVAILABLE"}
                      </p>

                      <div className="flex justify-between items-end border-t-2 border-dashed ${isSelected ? 'border-gray-800' : 'border-gray-300'} pt-4">
                        <p className={`text-3xl font-black italic ${isSelected ? 'text-[#00FFFF]' : 'text-[#1A1A1A]'}`}>
                          ₱{Number(svc.price).toFixed(2)}
                        </p>
                        <ChevronRight size={20} className={`${isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'} transition-all`} />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        {outOfStock ? (
                          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#EC008C] border-2 border-[#EC008C] px-2 py-1">
                            Out_Of_Stock
                          </span>
                        ) : isSelected ? (
                          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF] border-2 border-[#00FFFF] px-2 py-1">
                            In_Cart x {getSelectedQty(svc.id)}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1A1A1A] border-2 border-[#1A1A1A] px-2 py-1">
                            Not_In_Cart
                          </span>
                        )}
                        <span className={`font-mono text-[9px] font-black uppercase tracking-widest ${outOfStock ? "text-[#EC008C]" : isSelected ? "text-[#00FFFF]" : "text-[#EC008C]"}`}>
                          Stock {stockLeft}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* UPLOAD SECTION */}
            <section>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-4 mb-8">
                <span className="bg-[#FFF200] px-3 py-1 text-[#1A1A1A] not-italic border-4 border-[#1A1A1A]">02</span>
                Blueprint_Upload
              </h2>

              <label className="flex flex-col items-center justify-center gap-6 p-12 border-4 border-dashed border-[#1A1A1A]/20 bg-white hover:bg-[#EC008C]/5 hover:border-[#EC008C] transition-all cursor-pointer group">
                <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.ai,.psd" onChange={handleFileUpload} />
                <UploadCloud size={64} className="text-[#1A1A1A] group-hover:scale-110 group-hover:text-[#EC008C] transition-all" />
                <div className="text-center">
                  <p className="font-black uppercase italic text-2xl">Upload_Operational_Files</p>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest opacity-50 mt-2">PDF, AI, PSD, SVG (MAX 50MB)</p>
                </div>
              </label>

              {uploadedFiles.length > 0 && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {uploadedFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-4 bg-[#1A1A1A] text-white p-4 border-l-8 border-[#EC008C] overflow-hidden">
                      <FileText size={20} className="text-[#00FFFF] shrink-0" />
                      <span className="font-mono text-[10px] font-black uppercase tracking-wider truncate">{f.name}</span>
                      <button onClick={(e) => { e.preventDefault(); setUploadedFiles(prev => prev.filter(x => x.id !== f.id)); }} className="ml-auto text-white opacity-50 hover:opacity-100 hover:text-[#EC008C] transition-colors">
                        <AlertTriangle size={16} className="rotate-45" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CUSTOMER REVIEWS (THREAD STYLE) */}
            {(business.reviews?.length > 0) && (
              <section className="pt-8 mb-8 border-t-8 border-[#1A1A1A] border-dotted">
                <div className="flex items-center gap-4 mb-16">
                  <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none">
                    Intel_Log <br/><span className="text-[#EC008C]">Feedback</span>
                  </h2>
                  <span className="ml-auto bg-[#1A1A1A] px-4 py-2 text-[#00FFFF] font-mono text-[10px] font-black tracking-widest border-4 border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(255,242,0,1)]">
                    {business.reviews.length} THREADS
                  </span>
                </div>
                
                <div className="space-y-0 border-l-8 border-[#1A1A1A] ml-6 pl-12 relative">
                  {business.reviews.map((r, idx) => (
                    <div key={idx} className="relative pb-16 last:pb-0">
                      {/* Thread Node / Dot */}
                      <div className="absolute -left-[64px] top-6 w-8 h-8 bg-[#FFF200] border-4 border-[#1A1A1A] z-10 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]" />
                      
                      <div className="bg-white border-4 border-[#1A1A1A] p-8 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] group hover:-translate-y-2 transition-transform duration-300">
                         <div className="flex justify-between items-start mb-6">
                            <div>
                              <div className="flex items-center gap-3 mb-3">
                                <p className="font-black uppercase italic text-2xl">{r.customer_name || "AUTHORIZED_CLIENT"}</p>
                                <span className="font-mono text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 bg-[#1A1A1A] text-white">VERIFIED</span>
                              </div>
                              <div className="flex gap-1 bg-[#F9F9F7] w-fit p-2 border-2 border-[#1A1A1A]">
                                {[1,2,3,4,5].map(star => (
                                  <Star key={star} size={16} fill={star <= r.rating ? "#1A1A1A" : "none"} className={star <= r.rating ? "text-[#1A1A1A]" : "text-gray-300"} />
                                ))}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-[9px] uppercase font-black tracking-widest text-[#EC008C] block mb-1">Packet_Time</span>
                              <span className="font-mono text-[11px] uppercase tracking-widest font-black opacity-60">
                                {new Date(r.created_at).toLocaleDateString()}
                              </span>
                            </div>
                         </div>
                         <div className="bg-[#FDFDFD] border-t-4 border-dashed border-[#1A1A1A]/20 pt-6 mt-4">
                           <p className="font-mono text-sm uppercase text-[#1A1A1A] leading-loose font-bold tracking-wide">
                             "{r.feedback}"
                           </p>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT COLUMN: SUMMARY ── */}
          <aside className="lg:sticky lg:top-12 h-fit">
            <div className="bg-white border-4 border-[#1A1A1A] shadow-[12px_12px_0px_0px_rgba(0,255,255,1)] overflow-hidden">
              <div className="bg-[#1A1A1A] text-white px-8 py-6 flex items-center justify-between border-b-4 border-[#00FFFF]">
                <h2 className="font-black uppercase italic tracking-widest text-lg">Order_Specification</h2>
                <Hash size={24} className="text-[#00FFFF]" />
              </div>

              <div className="p-8">
                {selectedServices.length === 0 ? (
                  <div className="py-12 text-center border-4 border-dashed border-[#1A1A1A]/10">
                    <p className="font-mono text-[11px] font-black uppercase opacity-40">Waiting_for_input...</p>
                  </div>
                ) : (
                  <div className="space-y-6 mb-10">
                    {selectedServices.map((s) => (
                      <div key={s.id} className="flex justify-between items-start group">
                        <div className="min-w-0">
                          <p className="font-black uppercase italic text-sm leading-none">{s.name}</p>
                          <p className="font-mono text-[9px] uppercase font-bold opacity-40 mt-1">Unit_Price x {s.quantity || 1}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-[#1A1A1A]">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => upsertServiceQuantity(s, 0)}
                            className="inline-flex h-7 w-7 items-center justify-center border-2 border-[#EC008C] text-[#EC008C] hover:bg-[#EC008C] hover:text-white"
                            aria-label={`Remove ${s.name} from cart`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t-4 border-[#1A1A1A] pt-8 mb-10">
                  <div className="flex justify-between items-end mb-4">
                    <span className="font-mono text-[11px] uppercase tracking-[0.3em] font-black text-gray-500">Gross_Total</span>
                    <span className="text-4xl font-black italic leading-none">₱{total.toFixed(2)}</span>
                  </div>

                  {/* DOWNPAYMENT SELECTION */}
                  <div className="bg-[#F9F9F7] border-4 border-[#1A1A1A] p-6 mt-6">
                    <p className="font-black uppercase italic text-sm tracking-widest mb-4">Downpayment_Required</p>
                    <p className="font-mono text-[10px] opacity-60 uppercase mb-4">A minimum of {minimumDownpaymentPercent}% upfront payment via E-Wallet is required to process all orders.</p>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      {downpaymentOptions.map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDownpaymentPercent(pct)}
                          className={`px-4 py-2 font-mono text-[10px] font-black uppercase transition-all border-2 ${effectiveDownpaymentPercent === pct ? 'bg-[#00FFFF] border-[#1A1A1A] text-[#1A1A1A] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] hover:border-[#1A1A1A]'}`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-between items-end border-t-2 border-dashed border-[#1A1A1A]/20 pt-4">
                      <span className="font-mono text-[11px] uppercase tracking-[0.3em] font-black text-[#EC008C]">To_Pay_Now</span>
                      <span className="text-3xl font-black italic leading-none text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* DELIVERY SELECTION */}
                <div className="mb-10 text-black border-b-4 border-[#1A1A1A] pb-8 space-y-4">
                   <p className="font-black uppercase italic text-sm tracking-widest">Fulfillment_Type</p>
                   <div className="grid grid-cols-2 gap-4">
                     <button 
                       onClick={() => setDeliveryType("PICKUP")}
                       className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${deliveryType === 'PICKUP' ? 'bg-[#00FFFF] border-[#1A1A1A] text-[#1A1A1A]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                     >
                       <Package size={16} /> PICK_UP
                     </button>
                     <button 
                       onClick={() => setDeliveryType("DELIVERY")}
                       className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${deliveryType === 'DELIVERY' ? 'bg-[#EC008C] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                     >
                       <Truck size={16} /> DELIVERY
                     </button>
                   </div>
                   
                   {deliveryType === "DELIVERY" && (
                     <div className="mt-6 p-6 bg-[#F9F9F7] border-4 border-[#1A1A1A] space-y-6">
                       <div>
                         <p className="font-mono text-[10px] font-black uppercase tracking-widest mb-2 opacity-80">Full Address</p>
                         <textarea 
                           className="w-full border-2 border-[#1A1A1A] p-3 text-xs font-mono uppercase bg-white focus:outline-none focus:ring-2 focus:ring-[#EC008C]"
                           placeholder="Enter your exact delivery address..."
                           value={deliveryAddress}
                           onChange={(e) => setDeliveryAddress(e.target.value)}
                           rows={3}
                         />
                       </div>
                       <div>
                         <p className="font-mono text-[10px] font-black uppercase tracking-widest mb-2 opacity-80 flex gap-2 items-center"><MapPin size={12} /> Pin Location</p>
                         <LocationPicker 
                           lat={deliveryCoordinates?.lat} 
                           lng={deliveryCoordinates?.lng} 
                           onChange={(lat, lng) => setDeliveryCoordinates({ lat, lng })}
                         />
                        {deliveryLocationLoading && (
                          <p className="mt-2 font-mono text-[9px] font-black uppercase tracking-widest text-[#EC008C]">
                            Detecting your current location...
                          </p>
                        )}
                        {!deliveryLocationLoading && deliveryCoordinates && (
                          <p className="mt-2 font-mono text-[9px] font-black uppercase tracking-widest text-[#1A1A1A]/60">
                            Defaulting to your current location. You can move it by clicking another spot on the map.
                          </p>
                        )}
                       </div>
                     </div>
                   )}
                </div>

                {/* ORDER TIMING */}
                <div className="mb-10 text-black border-b-4 border-[#1A1A1A] pb-8 space-y-4">
                  <p className="font-black uppercase italic text-sm tracking-widest">Order_Timing</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFulfillmentMode("NEED_NOW");
                        setExpectedFulfillmentAt("");
                      }}
                      className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${fulfillmentMode === 'NEED_NOW' ? 'bg-[#00FFFF] border-[#1A1A1A] text-[#1A1A1A]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                    >
                      <Clock size={16} /> NEED_NOW
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentMode("ADVANCE")}
                      className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${fulfillmentMode === 'ADVANCE' ? 'bg-[#EC008C] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                    >
                      <Clock size={16} /> ADVANCE_ORDER
                    </button>
                  </div>

                  {fulfillmentMode === "ADVANCE" && (
                    <div className="mt-2 border-4 border-[#1A1A1A] bg-[#F9F9F7] p-4">
                      <p className="mb-2 font-mono text-[10px] font-black uppercase tracking-widest opacity-70">
                        Expected {deliveryType === "DELIVERY" ? "Delivery" : "Pick Up"} Date & Time
                      </p>
                      <input
                        type="datetime-local"
                        value={expectedFulfillmentAt}
                        min={minAdvanceDateTime}
                        onChange={(e) => setExpectedFulfillmentAt(e.target.value)}
                        className="w-full border-2 border-[#1A1A1A] bg-white px-3 py-3 font-mono text-xs font-black uppercase tracking-wider outline-none focus:border-[#00FFFF]"
                      />
                    </div>
                  )}
                </div>

                {/* PAYMENT METHOD SELECTION */}
                <div className="mb-10 text-black border-b-4 border-[#1A1A1A] pb-8 space-y-4">
                   <p className="font-black uppercase italic text-sm tracking-widest">Balance_Payment_Method</p>
                   <p className="font-mono text-[9px] uppercase opacity-50 font-bold mb-2">How will you pay the remaining balance of <span className="text-[#EC008C]">₱{balanceAmount.toFixed(2)}</span>?</p>
                   <div className="grid grid-cols-2 gap-4">
                     <button 
                       onClick={() => setPaymentMethod("COD")}
                       className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${paymentMethod === 'COD' ? 'bg-[#FFF200] border-[#1A1A1A] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                     >
                       <Banknote size={16} /> Cash (COD)
                     </button>
                     <button 
                       onClick={() => setPaymentMethod("E-Wallet")}
                       className={`py-4 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${paymentMethod === 'E-Wallet' ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]' : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'}`}
                     >
                       <CreditCard size={16} /> E-Wallet
                     </button>
                   </div>
                </div>

                {/* UPLOAD DOWNPAYMENT PROOF (ALWAYS REQUIRED) */}
                <div className="mb-10 border-b-4 border-[#1A1A1A] pb-8">
                   <div className="p-6 bg-[#F9F9F7] border-4 border-[#1A1A1A]">
                     <p className="font-black uppercase italic text-sm tracking-widest mb-1 text-[#EC008C]">Upload Downpayment Proof</p>
                     <p className="font-mono text-[9px] font-black uppercase tracking-widest mb-4 opacity-60">Upload E-Wallet receipt for ₱{downpaymentAmount.toFixed(2)}</p>
                     <input type="file" accept="image/*" onChange={handleReceiptUpload} className="text-xs font-mono w-full file:mr-4 file:py-2 file:px-4 file:border-2 file:border-[#1A1A1A] file:text-xs file:font-black file:uppercase file:bg-white hover:file:bg-[#FFF200] cursor-pointer" />
                     {receiptFile && (
                       <div className="mt-4 text-[10px] text-[#EC008C] font-black uppercase truncate flex items-center gap-2">
                         <CheckCircle2 size={12} /> {receiptFile.name}
                       </div>
                     )}
                   </div>
                </div>

                {!isCustomer ? (
                  <div className="bg-white text-[#EC008C] border-4 border-[#EC008C] p-6 font-mono text-[11px] font-bold uppercase tracking-wider text-center flex flex-col gap-3 shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
                    <AlertTriangle size={32} className="mx-auto" />
                    Auth Required: Only registered CUSTOMERS can place orders.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button
                      onClick={checkout}
                      disabled={isProcessing || !selectedServices.length}
                      className="w-full bg-[#1A1A1A] text-white py-6 px-6 font-black uppercase italic text-lg flex items-center justify-center gap-3 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] disabled:opacity-50 disabled:shadow-none translate-y-0 active:translate-y-2 active:shadow-none group"
                    >
                      {isProcessing ? (
                        <><Loader2 size={24} className="animate-spin" /> EXECUTING...</>
                      ) : (
                        <>EXECUTE_ORDER <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" /></>
                      )}
                    </button>
                  </div>
                )}

                <div className="mt-10 p-6 bg-[#F9F9F7] border-2 border-dashed border-[#1A1A1A]">
                  <p className="font-mono text-[10px] font-bold uppercase leading-relaxed opacity-60">
                    // NOTICE: By executing, you agree to version control V1 of uploaded assets. Initial proofing begins within 24 standard operational hours.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {quantityModalService && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-md border-4 border-[#1A1A1A] bg-white p-6 shadow-[10px_10px_0px_0px_rgba(0,255,255,1)]">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Set_Quantity</h3>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-60">
                {quantityModalService.name}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#EC008C]">
                Stock Left: {Math.max(0, Number(quantityModalService.stock_qty || 0))}
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantityInput((q) => String(Math.max(1, (Number.parseInt(q, 10) || 1) - 1)))}
                  className="inline-flex h-10 w-10 items-center justify-center border-2 border-[#1A1A1A] bg-white"
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>

                <input
                  type="number"
                  min="1"
                  max={Math.max(1, Number(quantityModalService.stock_qty || 1))}
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  className="w-24 border-2 border-[#1A1A1A] px-3 py-2 text-center font-mono text-lg font-black outline-none focus:border-[#00FFFF]"
                />

                <button
                  type="button"
                  onClick={() => setQuantityInput((q) => String((Number.parseInt(q, 10) || 1) + 1))}
                  className="inline-flex h-10 w-10 items-center justify-center border-2 border-[#1A1A1A] bg-white"
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                {getSelectedQty(quantityModalService.id) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      upsertServiceQuantity(quantityModalService, 0);
                      closeQuantityModal();
                    }}
                    className="border-2 border-[#EC008C] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#EC008C] hover:bg-[#EC008C] hover:text-white"
                  >
                    Remove_From_Cart
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeQuantityModal}
                  className="border-2 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.15em]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyQuantityToCart}
                  className="border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-white hover:bg-[#EC008C]"
                >
                  Add_To_Cart
                </button>
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-6"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="relative w-full max-w-4xl border-4 border-[#1A1A1A] bg-white p-4 shadow-[10px_10px_0px_0px_rgba(0,255,255,1)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] hover:bg-[#EC008C] hover:text-white"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>

              <p className="mb-3 pr-12 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-[#1A1A1A]/60">
                Service Image // {previewImage.name}
              </p>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.src}
                alt={`${previewImage.name} full preview`}
                className="max-h-[75vh] w-full border-2 border-[#1A1A1A] bg-[#F9F9F7] object-contain"
              />
            </div>
          </div>
        )}
      </div>
      </section>
    </main>
  );
}