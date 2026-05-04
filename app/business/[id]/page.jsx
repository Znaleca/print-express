"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  UploadCloud, CheckCircle2, CreditCard, Banknote,
  FileText, Star, MapPin, Loader2, Hash, ArrowRight,
  ChevronRight, Info, AlertTriangle, MessageSquare, Package, Truck, Minus, Plus, Clock, X, QrCode, Power
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
  const searchParams = useSearchParams();

  const checkoutServiceId = searchParams.get("checkout_service");
  const quoteAmount = searchParams.get("quote");
  const designUrl = searchParams.get("design_url");
  const designVersion = searchParams.get("design_version");
  const quoteId = searchParams.get("quote_id");

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  // User state
  const [user, setUser] = useState(null);
  const [isCustomer, setIsCustomer] = useState(false);

  // Form state
  const [selectedServices, setSelectedServices] = useState([]);
  const [cartInitialized, setCartInitialized] = useState(false);

  useEffect(() => {
    if (cartInitialized && typeof window !== "undefined") {
      localStorage.setItem(`cart_${id}`, JSON.stringify(selectedServices));
    }
  }, [selectedServices, cartInitialized, id]);
  const [quantityModalService, setQuantityModalService] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [inquiryModalService, setInquiryModalService] = useState(null);
  const [itemDetailsModal, setItemDetailsModal] = useState(null);
  const openItemDetails = (svc) => {
    setItemDetailsModal(svc);
    const currentQty = selectedServices.find((s) => s.id === svc.id)?.quantity || 0;
    setQuantityInput(String(currentQty > 0 ? currentQty : 1));
  };

  const [isOwner, setIsOwner] = useState(false);
  const [reviewsByItem, setReviewsByItem] = useState({});
  const [expandedReviews, setExpandedReviews] = useState({});
  
  const toggleReviews = (e, svcId) => {
    e.stopPropagation();
    setExpandedReviews((prev) => ({ ...prev, [svcId]: !prev[svcId] }));
  };



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
            id, name, address, description, min_downpayment_percent, qr_url, is_open,
            services ( id, name, price, price_max, item_type, description, category, available, image_url, stock_qty, is_customizable ),
            business_reviews ( order_id, rating, feedback, created_at, customer_name )
          `)
          .eq("id", id)
          .eq("status", "APPROVED")
          .single();

        // Check if current user is the owner
        if (user) {
          const { data: biz } = await supabase
            .from("businesses")
            .select("id")
            .eq("id", id)
            .eq("owner_id", user.id)
            .maybeSingle();
          setIsOwner(!!biz);
        }

          if (!error && data) {
          data.services = (data.services || []).filter(s => s.available);
          
            // Public review feed synced from /track submissions
          const allReviews = data.business_reviews || [];
            const visibleReviews = allReviews.filter(r => !!r.feedback);
            data.reviewCount = visibleReviews.length;
            data.ratingAvg = data.reviewCount > 0 
              ? (visibleReviews.reduce((sum, r) => sum + r.rating, 0) / data.reviewCount).toFixed(1)
            : "5.0";
            data.reviews = visibleReviews.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            data.allReviews = allReviews;

            // Group by customer for a simple preview card layout
          const grouped = {};
          allReviews.forEach(r => {
              const key = r.customer_name || "Anonymous";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(r);
          });
          setReviewsByItem(grouped);

          // Compute best seller ranking: top 3 services by review/order count
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

          const minDp = Math.min(100, Math.max(1, Number.parseInt(String(data.min_downpayment_percent ?? 30), 10) || 30));

          setBusiness(data);

          let existingCart = [];
          if (typeof window !== "undefined") {
            const savedCart = localStorage.getItem(`cart_${id}`);
            if (savedCart) {
              try { existingCart = JSON.parse(savedCart); } catch(e) {}
            }
          }

          if (checkoutServiceId) {
            const svc = data.services.find(s => s.id === checkoutServiceId);
            if (svc && quoteAmount) {
              const exists = existingCart.some(item => item.id === svc.id && item.isQuotedCheckout && item.price === quoteAmount);
              if (!exists) {
                existingCart.push({ 
                  ...svc, 
                  quantity: 1, 
                  price: quoteAmount, 
                  isQuotedCheckout: true,
                  designUrl: designUrl,
                  designVersion: designVersion
                });
              }
              if (designUrl) {
                setUploadedFiles(prev => {
                  const fExists = prev.some(f => f.url === designUrl);
                  if (fExists) return prev;
                  return [...prev, { name: `Approved Design Version ${designVersion || "1"}`, url: designUrl, isUrl: true, id: Date.now() }];
                });
              }
            }

            // Clear URL params so a refresh won't automatically re-add the quoted service if the user removed it
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
  }, [id, checkoutServiceId, quoteAmount, designUrl, designVersion]);

  const hideReview = async (orderId, hide) => {
    await supabase.from("orders").update({
      feedback_hidden: hide,
      feedback_hidden_at: hide ? new Date().toISOString() : null,
      feedback_hidden_by: hide ? "owner" : null,
    }).eq("id", orderId);
    // Update local state
    setReviewsByItem(prev => {
      const updated = {};
      Object.keys(prev).forEach(key => {
        updated[key] = prev[key].map(r =>
          r.order_id === orderId ? { ...r, feedback_hidden: hide, feedback_hidden_by: hide ? "owner" : null } : r
        );
      });
      return updated;
    });
    setBusiness(prev => ({
      ...prev,
      reviews: (prev.reviews || []).filter(r => r.order_id !== orderId || !hide),
    }));
  };

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

  const isClosed = business.is_open === false;

  return (
    <main
      className="min-h-[calc(100vh-80px)] bg-[#FDFDFD] font-sans overflow-x-hidden transition-all duration-500"
      style={isClosed ? { filter: "grayscale(1)", background: "#F0F0F0" } : {}}
    >
      <section className="relative px-6 pb-24 pt-10 md:px-10 md:pt-12">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        {/* ── CLOSED BANNER ── */}
        {isClosed && (
          <div
            className="relative z-30 mb-6 flex items-center justify-center gap-4 border-4 border-[#1A1A1A] bg-[#1A1A1A] py-5 px-6 shadow-[8px_8px_0px_0px_rgba(100,100,100,0.4)] overflow-hidden"
          >
            {/* diagonal stripes */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 10px, transparent 10px, transparent 20px)"
            }} />
            <div className="relative flex flex-col items-center gap-1 text-center">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Status // Node_Offline</p>
              <p className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white leading-none">
                Shop is <span className="line-through opacity-40">Open</span>&nbsp;—&nbsp;CLOSED
              </p>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.25em] text-white/60 mt-1">
                Orders cannot be placed at this time. Check back soon.
              </p>
            </div>
          </div>
        )}

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
              {/* Open / Closed badge */}
              <div className={`inline-flex items-center gap-2 border-4 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest ${
                business.is_open !== false
                  ? "border-[#1A1A1A] bg-[#00FFFF] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                  : "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]"
              }`}>
                <Power size={12} className={business.is_open !== false ? "text-[#1A1A1A]" : "text-[#EC008C]"} />
                {business.is_open !== false ? "● Open" : "○ Closed"}
              </div>
              <div className="font-mono text-[10px] uppercase opacity-40 tracking-tighter font-black flex items-center gap-2 mt-2 md:mt-0">
                <Hash size={12} className="text-[#00FFFF]" /> ID: {business.id.split('-')[0]} // STATUS: ONLINE
              </div>
            </div>
          </div>
          {/* Message Button */}
          {isCustomer && (
            <Link
              href={`/messages?business=${business.id}&greet=1`}
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

        {/* ── BEST SELLERS SECTION ── */}
        {(() => {
          const allItems = business.services || [];
          const allReviews = business.allReviews || [];
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

          const rankColors = ["#FFF200", "#00FFFF", "#EC008C"];
          const rankNums = ["01", "02", "03"];

          return (
            <section className="bg-[#1A1A1A] border-4 border-[#1A1A1A]">
              {/* Label */}
              <div className="px-8 pt-8 pb-4 flex items-center gap-3">
                <Star size={14} fill="#FFF200" className="text-[#FFF200]" />
                <span className="font-mono text-[11px] font-black uppercase tracking-[0.4em] text-white/50">
                  Best Sellers
                </span>
              </div>

              {/* Cards row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-6">
                {top3.map(({ item, name, count }, i) => (
                  <div
                    key={item.id}
                    onClick={() => openItemDetails(item)}
                    className="group flex items-center gap-4 bg-[#242424] border-2 border-[#2e2e2e] hover:border-[#3e3e3e] hover:-translate-y-0.5 transition-all cursor-pointer p-4"
                  >
                    {/* Rank number */}
                    <span
                      className="font-black text-4xl leading-none tabular-nums flex-shrink-0 w-12 text-center"
                      style={{ color: rankColors[i] }}
                    >
                      {rankNums[i]}
                    </span>

                    {/* Thumbnail */}
                    <div className="w-14 h-14 flex-shrink-0 overflow-hidden border-2 bg-[#1a1a1a]" style={{ borderColor: rankColors[i] }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={18} className="text-white/20" />
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <div className="min-w-0">
                      <p className="font-black uppercase italic text-white text-sm leading-tight truncate group-hover:text-[#FFF200] transition-colors">
                        {name}
                      </p>
                      <p className="font-mono text-[10px] text-white/30 mt-1 uppercase tracking-widest">
                        {count} {count === 1 ? "order" : "orders"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

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
            {business.services.filter(s => s.item_type !== "product").length > 0 && (
              <section className="mb-16">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-4">
                    <span className="bg-[#FFF200] px-3 py-1 text-[#1A1A1A] not-italic border-4 border-[#1A1A1A]">01</span>
                    Service_Catalog
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {business.services.filter(s => s.item_type !== "product").map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    const isBestSeller = business.bestSellerNames?.has(svc.name);
                    return (
                      <div
                        key={svc.id}
                        onClick={() => openItemDetails(svc)}
                        className={`group relative text-left p-6 border-4 transition-all cursor-pointer ${isSelected
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] -translate-y-1"
                            : "bg-white border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white hover:shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] hover:-translate-y-1"
                          }`}
                      >
                        {isBestSeller && (
                          <div className="absolute -top-[2px] -right-[2px] z-10 flex items-center gap-1 bg-[#EC008C] border-2 border-[#1A1A1A] px-3 py-1 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
                            <Star size={10} fill="#FFF200" className="text-[#FFF200]" />
                            <span className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-white">Best Seller</span>
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-4">
                          <span className={`font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 ${isSelected ? 'border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]' : 'border-[#1A1A1A] bg-[#1A1A1A] text-white group-hover:border-[#00FFFF] group-hover:text-[#00FFFF]'}`}>
                            {svc.category || "GENERAL"}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-[#00FFFF] text-[#00FFFF]">
                                Qty {getSelectedQty(svc.id)}
                              </span>
                              <CheckCircle2 className="text-[#00FFFF]" size={24} />
                            </div>
                          )}
                        </div>

                        <p className={`font-black uppercase italic text-2xl mb-4 leading-tight ${isSelected ? 'text-[#00FFFF]' : 'group-hover:text-[#00FFFF]'}`}>{svc.name}</p>
                        
                        {svc.image_url ? (
                          <div className={`w-full border-4 p-2 relative ${isSelected ? 'border-[#00FFFF] bg-[#1A1A1A]/50' : 'border-[#1A1A1A] bg-[#F9F9F7] group-hover:border-[#00FFFF]'}`}>
                            <img
                              src={svc.image_url}
                              alt={`${svc.name} sample`}
                              className="mx-auto h-48 w-full object-contain transition-transform group-hover:scale-105"
                            />
                          </div>
                        ) : (
                           <div className={`w-full h-48 border-4 border-dashed flex items-center justify-center relative ${isSelected ? 'border-[#00FFFF] bg-[#1A1A1A]/50 text-[#00FFFF]/40' : 'border-[#1A1A1A] bg-[#F9F9F7] text-[#1A1A1A]/40 group-hover:border-[#00FFFF] group-hover:text-[#00FFFF]'}`}>
                             <p className="font-mono text-[10px] font-black uppercase tracking-widest">No Image</p>
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PRODUCT SELECTION */}
            {business.services.filter(s => s.item_type === "product").length > 0 && (
              <section className="mb-16">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-4">
                    <span className="bg-[#00FFFF] px-3 py-1 text-[#1A1A1A] not-italic border-4 border-[#1A1A1A]">01B</span>
                    Product_Inventory
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {business.services.filter(s => s.item_type === "product").map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    const stockLeft = Math.max(0, Number(svc.stock_qty || 0));
                    const outOfStock = stockLeft <= 0;
                    const isBestSeller = business.bestSellerNames?.has(svc.name);
                    
                    return (
                      <div
                        key={svc.id}
                        onClick={() => {
                          if (outOfStock) return;
                          openItemDetails(svc);
                        }}
                        className={`group relative text-left p-6 border-4 transition-all ${isSelected
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] -translate-y-1"
                            : "bg-white border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white hover:shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] hover:-translate-y-1"
                          } ${outOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {isBestSeller && (
                          <div className="absolute -top-[2px] -right-[2px] z-10 flex items-center gap-1 bg-[#EC008C] border-2 border-[#1A1A1A] px-3 py-1 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
                            <Star size={10} fill="#FFF200" className="text-[#FFF200]" />
                            <span className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-white">Best Seller</span>
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-4">
                          <span className={`font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 ${isSelected ? 'border-[#00FFFF] bg-[#00FFFF] text-[#1A1A1A]' : 'border-[#1A1A1A] bg-[#1A1A1A] text-white group-hover:border-[#EC008C] group-hover:text-[#EC008C]'}`}>
                            {svc.category || "GENERAL"}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-[#00FFFF] text-[#00FFFF]">
                                Qty {getSelectedQty(svc.id)}
                              </span>
                              <CheckCircle2 className="text-[#00FFFF]" size={24} />
                            </div>
                          )}
                        </div>

                        <p className={`font-black uppercase italic text-2xl mb-4 leading-tight ${isSelected ? 'text-[#00FFFF]' : 'group-hover:text-[#EC008C]'}`}>{svc.name}</p>
                        
                        {svc.image_url ? (
                          <div className={`w-full border-4 p-2 relative ${isSelected ? 'border-[#00FFFF] bg-[#1A1A1A]/50' : 'border-[#1A1A1A] bg-[#F9F9F7] group-hover:border-[#EC008C]'}`}>
                            <img
                              src={svc.image_url}
                              alt={`${svc.name} sample`}
                              className="mx-auto h-48 w-full object-contain transition-transform group-hover:scale-105"
                            />
                            {outOfStock && (
                              <div className="absolute inset-0 bg-[#1A1A1A]/80 flex items-center justify-center backdrop-blur-sm">
                                <span className="font-mono text-[12px] font-black uppercase tracking-[0.2em] text-[#EC008C] border-2 border-[#EC008C] px-3 py-1 bg-[#1A1A1A] rotate-12">OUT_OF_STOCK</span>
                              </div>
                            )}
                          </div>
                        ) : (
                           <div className={`w-full h-48 border-4 border-dashed flex items-center justify-center relative ${isSelected ? 'border-[#00FFFF] bg-[#1A1A1A]/50 text-[#00FFFF]/40' : 'border-[#1A1A1A] bg-[#F9F9F7] text-[#1A1A1A]/40 group-hover:border-[#EC008C] group-hover:text-[#EC008C]'}`}>
                             <p className="font-mono text-[10px] font-black uppercase tracking-widest">No Image</p>
                             {outOfStock && (
                              <div className="absolute inset-0 bg-[#1A1A1A]/80 flex items-center justify-center backdrop-blur-sm">
                                <span className="font-mono text-[12px] font-black uppercase tracking-[0.2em] text-[#EC008C] border-2 border-[#EC008C] px-3 py-1 bg-[#1A1A1A] rotate-12">OUT_OF_STOCK</span>
                              </div>
                            )}
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}



          </div>

          {/* ── RIGHT COLUMN: SUMMARY ── */}
          <aside className="lg:sticky lg:top-12 h-fit space-y-6">

            {/* QR Payment Card */}
            {business.qr_url && (
              <div className="bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(255,242,0,1)] overflow-hidden">
                <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between border-b-4 border-[#FFF200]">
                  <h2 className="font-black uppercase italic tracking-widest text-sm">QR_Payment</h2>
                  <QrCode size={20} className="text-[#FFF200]" />
                </div>
                <div className="p-6 flex flex-col items-center gap-4">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/60 text-center">
                    Scan to pay your downpayment via GCash / Maya / Bank
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="mx-auto overflow-hidden border-4 border-[#1A1A1A] bg-white" style={{ aspectRatio: "9/16", width: "160px" }}>
                    <img
                      src={business.qr_url}
                      alt="Payment QR code"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-[#1A1A1A]/40 text-center">
                    Upload your receipt below after scanning
                  </p>
                </div>
              </div>
            )}

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
                      <div key={s.id} className="flex flex-col gap-4 border-b-2 border-dashed border-[#1A1A1A]/10 pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start group">
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
                        
                        {s.isQuotedCheckout && (
                          <div className="flex items-center gap-3 mt-3 border-t-2 border-dashed border-[#1A1A1A]/10 pt-3">
                            <span className="font-mono text-[9px] uppercase tracking-widest font-black opacity-50">Qty</span>
                            <button
                              type="button"
                              onClick={() => setSelectedServices(prev => prev.map(item => item.id === s.id ? { ...item, quantity: Math.max(1, (item.quantity || 1) - 1) } : item))}
                              className="inline-flex h-7 w-7 items-center justify-center border-2 border-[#1A1A1A] bg-white hover:bg-[#FFF200] transition-colors"
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={s.quantity || 1}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                setSelectedServices(prev => prev.map(item => item.id === s.id ? { ...item, quantity: val } : item));
                              }}
                              className="w-14 text-center border-2 border-[#1A1A1A] font-mono text-sm font-black py-1 focus:outline-none focus:border-[#00FFFF]"
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedServices(prev => prev.map(item => item.id === s.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item))}
                              className="inline-flex h-7 w-7 items-center justify-center border-2 border-[#1A1A1A] bg-white hover:bg-[#00FFFF] transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        )}

                        {s.isQuotedCheckout && s.designUrl && (
                          <div className="border-2 border-[#1A1A1A] p-2 bg-[#1A1A1A]/5 mt-2">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#EC008C]">Approved_Design</p>
                              <span className="bg-[#1A1A1A] text-white font-mono text-[9px] font-black uppercase tracking-widest px-2 py-1">Version {s.designVersion || "1"}</span>
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.designUrl} alt="Approved Design" className="w-full h-auto object-contain max-h-48 border-2 border-[#1A1A1A]/20 bg-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t-4 border-[#1A1A1A] pt-8 mb-10">
                  <div className="flex justify-between items-end mb-4">
                    <span className="font-mono text-[11px] uppercase tracking-[0.3em] font-black text-gray-500">Gross_Total (Est)</span>
                    <span className="text-4xl font-black italic leading-none">₱{selectedServices.reduce((s, x) => s + Number(x.price) * (x.quantity || 1), 0).toFixed(2)}{selectedServices.some(s => s.item_type !== "product") ? "+" : ""}</span>
                  </div>

                  {/* PROCEED TO CHECKOUT BUTTON */}
                  <div className="pt-8 mt-6 border-t-4 border-[#1A1A1A]">
                    <button
                      onClick={() => router.push(`/checkout/${business.id}`)}
                      disabled={selectedServices.length === 0}
                      className="w-full bg-[#1A1A1A] text-white py-6 px-6 font-black uppercase italic text-lg flex items-center justify-center gap-3 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] disabled:opacity-50 disabled:shadow-none translate-y-0 active:translate-y-2 active:shadow-none group"
                    >
                      PROCEED_TO_CHECKOUT <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        

        {/* REVIEWS & FEEDBACK */}
        <section className="mt-16 bg-white border-4 border-[#1A1A1A] shadow-[12px_12px_0px_0px_rgba(0,255,255,1)] overflow-hidden">
          <div className="border-b-4 border-[#1A1A1A] bg-[#F9F9F7] px-6 py-6 md:px-8 md:py-8 text-[#1A1A1A]">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.45em] text-[#EC008C] mb-3">YOUR OPINIONS MATTER</p>
                <h3 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-none">
                  Reviews & Feedback
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 border-4 border-[#1A1A1A] bg-[#FFF200] px-4 py-3 text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,0.12)]">
                  <Star size={16} fill="#FFF200" className="text-[#FFF200]" />
                  <span className="font-black italic text-lg leading-none">{business.ratingAvg || "5.0"}</span>
                </div>
                <div className="border-4 border-[#1A1A1A] bg-white px-4 py-3 text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,0.08)]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-black/40">Total Reviews</p>
                  <p className="text-2xl font-black italic leading-none">{business.reviewCount || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {(business.reviews || []).length > 0 ? (
            <div className="space-y-5 p-6 md:p-8 bg-[#F9F9F7]">
              {business.reviews.slice(0, 6).map((review) => (
                <article key={review.order_id} className="border-4 border-[#1A1A1A] bg-white p-5 md:p-6 shadow-[8px_8px_0px_0px_rgba(26,26,26,0.12)] border-l-[12px] border-l-[#00FFFF]">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="font-black uppercase italic text-2xl leading-none text-[#1A1A1A]">{review.customer_name || "Anonymous"}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-black/35 mt-2">
                        {new Date(review.created_at).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          size={14}
                          fill={index < review.rating ? "#FFF200" : "none"}
                          className={index < review.rating ? "text-[#1A1A1A]" : "text-black/15"}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-base leading-relaxed text-[#1A1A1A]/80 italic">
                    {review.feedback}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 md:px-8 bg-[#F9F9F7]">
              <div className="border-4 border-dashed border-[#1A1A1A]/10 py-14 text-center bg-white">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] font-black opacity-40">Waiting_for_feedback...</p>
                <p className="mt-2 text-sm text-black/40">Reviews submitted in /track will appear here.</p>
              </div>
            </div>
          )}
        </section>

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
          {/* ── INQUIRY MODAL ── */}
          
        {itemDetailsModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1A1A1A]/80 p-4 md:p-8 backdrop-blur-md overflow-y-auto" onClick={() => setItemDetailsModal(null)}>
            <div className="w-full max-w-5xl bg-[#FDFDFD] border-4 border-[#1A1A1A] shadow-[16px_16px_0px_0px_rgba(236,0,140,1)] flex flex-col md:flex-row max-h-full relative mt-auto mb-auto" onClick={(e) => e.stopPropagation()}>
              
              {/* Close Button */}
              <button
                onClick={() => setItemDetailsModal(null)}
                className="absolute -top-4 -right-4 z-50 p-2 bg-[#EC008C] text-white border-4 border-[#1A1A1A] hover:bg-[#FFF200] hover:text-[#1A1A1A] hover:scale-110 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
              >
                <X size={24} className="stroke-[3]" />
              </button>

              {/* Left Side - Image */}
              <div className="md:w-1/2 border-b-4 md:border-b-0 md:border-r-4 border-[#1A1A1A] bg-[#F9F9F7] flex items-center justify-center p-8 relative shrink-0">
                <div className="absolute top-4 left-4 z-10">
                  <span className="font-mono text-[10px] font-black uppercase tracking-widest px-3 py-1 border-2 border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[2px_2px_0px_0px_rgba(0,255,255,1)]">
                    {itemDetailsModal.category || "GENERAL"}
                  </span>
                </div>
                {itemDetailsModal.image_url ? (
                  <img
                    src={itemDetailsModal.image_url}
                    alt={itemDetailsModal.name}
                    className="max-h-[50vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center opacity-30">
                    <Package size={64} className="mb-4" />
                    <p className="font-mono text-sm font-black uppercase tracking-widest">No Image Available</p>
                  </div>
                )}
              </div>

              {/* Right Side - Details & Recommendations */}
              <div className="md:w-1/2 flex flex-col overflow-y-auto">
                <div className="p-8 border-b-4 border-[#1A1A1A]">
                  <h3 className="text-4xl font-black uppercase italic tracking-tighter text-[#1A1A1A] leading-none mb-4">
                    {itemDetailsModal.name}
                  </h3>
                  
                  <div className="flex items-end gap-4 mb-6">
                    <p className="text-4xl font-black italic text-[#EC008C] leading-none">
                      {itemDetailsModal.price_max && parseFloat(itemDetailsModal.price_max) > parseFloat(itemDetailsModal.price) 
                        ? `₱${Number(itemDetailsModal.price).toFixed(2)} – ₱${Number(itemDetailsModal.price_max).toFixed(2)}` 
                        : `₱${Number(itemDetailsModal.price).toFixed(2)}${itemDetailsModal.item_type !== "product" ? "+" : ""}`}
                    </p>
                    {itemDetailsModal.item_type === "product" && (
                      <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[#1A1A1A]/50 mb-1">
                        Stock: {Math.max(0, Number(itemDetailsModal.stock_qty || 0))}
                      </span>
                    )}
                  </div>

                  <p className="font-mono text-sm font-bold text-gray-700 leading-relaxed mb-8 bg-white border-2 border-[#1A1A1A] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    {itemDetailsModal.description || "No description provided for this item."}
                  </p>

                  {/* Actions based on item_type */}
                  {itemDetailsModal.item_type !== "product" ? (
                    <button
                      onClick={() => {
                        setItemDetailsModal(null);
                        setInquiryModalService(itemDetailsModal);
                      }}
                      className="w-full bg-[#00FFFF] text-[#1A1A1A] border-4 border-[#1A1A1A] py-5 px-6 font-black uppercase italic text-xl flex items-center justify-center gap-3 hover:bg-[#1A1A1A] hover:text-[#00FFFF] transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] group"
                    >
                      Inquire This Service <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                    </button>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {Number(itemDetailsModal.stock_qty) <= 0 ? (
                        <div className="w-full bg-[#1A1A1A] text-[#EC008C] border-4 border-[#1A1A1A] py-5 px-6 font-black uppercase italic text-xl flex items-center justify-center text-center opacity-80">
                          Out of Stock
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/60">Quantity:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(quantityInput, 10) || 1;
                                setQuantityInput(String(Math.max(1, current - 1)));
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center border-2 border-[#1A1A1A] bg-white hover:bg-[#1A1A1A] hover:text-white transition-colors"
                            >
                              <Minus size={16} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={itemDetailsModal.item_type === "product" ? Math.max(1, Number(itemDetailsModal.stock_qty || 1)) : 99999}
                              value={quantityInput}
                              onChange={(e) => setQuantityInput(e.target.value)}
                              className="w-20 border-2 border-[#1A1A1A] px-2 py-2 text-center font-mono text-lg font-black outline-none focus:border-[#00FFFF]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const current = parseInt(quantityInput, 10) || 1;
                                setQuantityInput(String(current + 1));
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center border-2 border-[#1A1A1A] bg-white hover:bg-[#1A1A1A] hover:text-white transition-colors"
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <div className="flex gap-4">
                            <button
                              onClick={() => {
                                const maxStock = Math.max(0, Number(itemDetailsModal.stock_qty || 0));
                                const parsed = Number.parseInt(quantityInput, 10);
                                const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                                const qty = Math.min(normalized, maxStock);
                                upsertServiceQuantity(itemDetailsModal, qty);
                              }}
                              className="flex-1 bg-[#FFF200] text-[#1A1A1A] border-4 border-[#1A1A1A] py-5 px-6 font-black uppercase italic text-xl flex items-center justify-center gap-3 hover:bg-[#1A1A1A] hover:text-[#FFF200] transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] group"
                            >
                              <Plus size={24} /> {getSelectedQty(itemDetailsModal.id) > 0 ? "Update Cart" : "Add to Cart"}
                            </button>
                            {getSelectedQty(itemDetailsModal.id) > 0 && (
                              <button
                                onClick={() => { upsertServiceQuantity(itemDetailsModal, 0); setQuantityInput("1"); }}
                                className="px-6 py-5 border-4 border-[#EC008C] text-[#EC008C] bg-white hover:bg-[#EC008C] hover:text-white font-black uppercase italic transition-all"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          {getSelectedQty(itemDetailsModal.id) > 0 && (
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF] bg-[#1A1A1A] px-3 py-2 text-center">
                              Currently in cart: {getSelectedQty(itemDetailsModal.id)}
                            </p>
                          )}

                          {/* Customize button — only for customizable products */}
                          {itemDetailsModal.is_customizable && isCustomer && (
                            <button
                              onClick={() => {
                                setItemDetailsModal(null);
                                setInquiryModalService(itemDetailsModal);
                              }}
                              className="w-full bg-[#EC008C] text-white border-4 border-[#1A1A1A] py-4 px-6 font-black uppercase italic text-lg flex items-center justify-center gap-3 hover:bg-[#1A1A1A] hover:text-[#EC008C] transition-all shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] group"
                            >
                              <span className="text-xl">✦</span> Customize This Product
                              <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Recommendations */}
                <div className="p-8 bg-[#F9F9F7] grow">
                  <h4 className="font-black uppercase italic text-xl mb-4 flex items-center gap-2">
                    <Star size={20} className="text-[#EC008C]" fill="#EC008C" /> Also Recommend
                  </h4>
                  <div className="flex flex-col gap-3">
                    {business.services
                      .filter(s => s.id !== itemDetailsModal.id && s.available)
                      .sort(() => 0.5 - Math.random())
                      .slice(0, 3)
                      .map(rec => (
                        <div 
                          key={rec.id}
                          onClick={() => openItemDetails(rec)}
                          className="flex items-center gap-4 bg-white border-2 border-[#1A1A1A] p-3 cursor-pointer hover:bg-[#1A1A1A] hover:text-[#00FFFF] group transition-colors shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]"
                        >
                          {rec.image_url ? (
                            <img src={rec.image_url} alt={rec.name} className="w-16 h-16 object-cover border-2 border-[#1A1A1A] bg-[#F9F9F7]" />
                          ) : (
                            <div className="w-16 h-16 bg-[#1A1A1A]/5 border-2 border-[#1A1A1A] flex items-center justify-center">
                              <Package size={20} className="opacity-50" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-black uppercase italic text-sm truncate group-hover:text-white transition-colors">{rec.name}</p>
                            <p className="font-mono text-[10px] font-bold text-[#EC008C] uppercase tracking-widest mt-1">
                              ₱{Number(rec.price).toFixed(2)}{rec.item_type !== "product" ? "+" : ""}
                            </p>
                          </div>
                          <ChevronRight size={20} className="text-[#1A1A1A] group-hover:text-[#00FFFF] shrink-0" />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

          {/* ── INQUIRY MODAL ── */}
          {inquiryModalService && (
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#1A1A1A]/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-2xl bg-[#FDFDFD] border-4 border-[#1A1A1A] shadow-[12px_12px_0px_0px_rgba(0,255,255,1)] flex flex-col max-h-[90vh] overflow-hidden relative">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-[#00FFFF]" />
                      <div className="w-2 h-2 bg-[#EC008C]" />
                      <div className="w-2 h-2 bg-[#FFF200]" />
                    </div>
                    <span className="font-black uppercase italic tracking-widest text-lg">Inquiry_Action</span>
                  </div>
                  <button
                    onClick={() => setInquiryModalService(null)}
                    className="p-1 hover:bg-[#EC008C] transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                {/* Content */}
                <div className="p-8 overflow-y-auto">
                  <div className="mb-8">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 font-black mb-1">
                      Selected Service
                    </p>
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter text-[#1A1A1A]">
                      {inquiryModalService.name}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600 font-bold max-w-lg">
                      How would you like to proceed with your inquiry? Select an option below to start your conversation with the shop owner.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Option 1: Upload Design */}
                    <button
                      onClick={() => router.push(`/messages?business=${business.id}&service=${inquiryModalService.id}&action=upload_design`)}
                      className="group flex flex-col items-center text-center border-4 border-[#1A1A1A] p-6 hover:bg-[#FFF200] hover:-translate-y-1 transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,255,255,1)] bg-white cursor-pointer"
                    >
                      <div className="w-16 h-16 bg-[#1A1A1A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <UploadCloud size={32} className="text-[#00FFFF]" />
                      </div>
                      <h4 className="font-black uppercase italic text-xl mb-2">Upload Design</h4>
                      <p className="font-mono text-[10px] uppercase font-bold text-gray-600 leading-relaxed">
                        Attach your artwork or design files directly to the chat for a faster quote.
                      </p>
                    </button>
                    
                    {/* Option 2: Video Call */}
                    <button
                      onClick={() => router.push(`/messages?business=${business.id}&service=${inquiryModalService.id}&action=video_call`)}
                      className="group flex flex-col items-center text-center border-4 border-[#1A1A1A] p-6 hover:bg-[#00FFFF] hover:-translate-y-1 transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] hover:shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] bg-white cursor-pointer"
                    >
                      <div className="w-16 h-16 bg-[#1A1A1A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Clock size={32} className="text-[#EC008C]" />
                      </div>
                      <h4 className="font-black uppercase italic text-xl mb-2">Video Call</h4>
                      <p className="font-mono text-[10px] uppercase font-bold text-gray-600 leading-relaxed">
                        Request a scheduled video consultation with the owner to discuss details.
                      </p>
                    </button>
                    
                    {/* Option 3: Chat */}
                    <button
                      onClick={() => router.push(`/messages?business=${business.id}&service=${inquiryModalService.id}&action=chat`)}
                      className="group flex flex-col items-center text-center border-4 border-[#1A1A1A] p-6 hover:bg-[#1A1A1A] hover:text-white hover:-translate-y-1 transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] bg-white cursor-pointer"
                    >
                      <div className="w-16 h-16 bg-[#EC008C] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border-2 border-[#1A1A1A]">
                        <MessageSquare size={32} className="text-white" />
                      </div>
                      <h4 className="font-black uppercase italic text-xl mb-2 group-hover:text-[#00FFFF] transition-colors">Message</h4>
                      <p className="font-mono text-[10px] uppercase font-bold text-gray-600 group-hover:text-gray-300 leading-relaxed transition-colors">
                        Just open the chat to ask a question or discuss this service.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>
    </main>
  );
}