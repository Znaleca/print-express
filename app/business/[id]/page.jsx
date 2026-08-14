"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  UploadCloud, CheckCircle2, CreditCard,
  FileText, Star, MapPin, Loader2, ArrowRight,
  ChevronRight, Info, AlertTriangle, MessageSquare, Package, Minus, Plus, Clock, X, QrCode, Power, ShieldCheck
} from "lucide-react";

export default function BusinessDetailsPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const checkoutServiceId = searchParams.get("checkout_service");
  const quoteAmount = searchParams.get("quote");
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
            id, name, address, description, min_downpayment_percent, qr_url, is_open,
            services ( id, name, price, price_max, item_type, description, category, available, image_url, stock_qty, is_customizable, specs_json ),
            business_reviews ( order_id, rating, feedback, created_at, customer_name )
          `)
          .eq("id", id)
          .eq("status", "APPROVED")
          .single();

        if (!error && data) {
          data.services = (data.services || []).filter(s => s.available);
          
          const allReviews = data.business_reviews || [];
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
  }, [id, checkoutServiceId, quoteAmount, designUrl, designVersion]);

  const getSelectedQty = (serviceId) =>
    selectedServices.find((s) => s.id === serviceId)?.quantity || 0;

  const upsertServiceQuantity = (svc, qty) => {
    setSelectedServices((prev) => {
      const matchKey = svc.cart_item_id || svc.id + JSON.stringify(svc.selected_specs || {});
      const existing = prev.find((s) => (s.cart_item_id || s.id + JSON.stringify(s.selected_specs || {})) === matchKey);
      
      if (qty <= 0) return prev.filter((s) => (s.cart_item_id || s.id + JSON.stringify(s.selected_specs || {})) !== matchKey);
      if (!existing) return [...prev, { ...svc, quantity: qty, cart_item_id: matchKey }];
      
      return prev.map((s) => (s.cart_item_id || s.id + JSON.stringify(s.selected_specs || {})) === matchKey ? { ...s, quantity: qty } : s);
    });
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
    <main className="min-h-screen bg-slate-50 font-sans pb-24">
      
      {/* Shop Header Banner */}
      <section className="bg-white border-b border-slate-200 py-6 px-4 sm:px-6 lg:px-8 relative shadow-sm">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />

        <div className="max-w-[1600px] mx-auto space-y-4">
          
          {/* Closed Status Notification */}
          {isClosed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-xs font-medium flex items-center gap-3">
              <Power size={18} className="text-amber-600 shrink-0" />
              <span>This shop is currently <strong>CLOSED</strong>. Services can be browsed, but new order submissions are temporarily paused.</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold mb-3">
                <ShieldCheck size={14} className="text-[#00E5FF]" /> Verified Print Shop
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
                {business.name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <MapPin size={14} className="text-[#EC008C]" /> {business.address}
                </span>

                <div className="flex items-center gap-1 font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <span>{business.ratingAvg}</span>
                  <span className="text-slate-400 font-normal">({business.reviewCount} reviews)</span>
                </div>

                <span className={`px-2.5 py-1 rounded-lg font-bold text-[11px] uppercase tracking-wider ${
                  !isClosed ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-700"
                }`}>
                  {!isClosed ? "Open for orders" : "Closed"}
                </span>
              </div>
            </div>

            {/* Direct Message Action */}
            {isCustomer && (
              <Link
                href={`/messages?business=${business.id}&greet=1`}
                className="inline-flex items-center gap-2.5 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-[#EC008C] transition-all shadow-md shrink-0"
              >
                <MessageSquare size={16} />
                Message Shop
                <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {business.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl border-t border-slate-100 pt-4">
              {business.description}
            </p>
          )}

        </div>
      </section>

      {/* Main Content Layout */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
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
            <section className="mb-10 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
              <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
                <Star size={14} className="fill-amber-400 text-amber-400" /> Popular Services & Products
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {top3.map(({ item, name, count }, i) => (
                  <div
                    key={item.id}
                    onClick={() => openItemDetails(item)}
                    className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 hover:bg-slate-100/60 transition-all cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {item.image_url ? (
                        <img src={item.image_url} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={20} className="text-slate-400" />
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* LEFT COLUMN: SERVICES & PRODUCTS */}
          <div className="lg:col-span-2 space-y-10">

            {/* SERVICES */}
            {business.services.filter(s => s.item_type !== "product").length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <span>Printing Services</span>
                  <span className="text-xs text-slate-400 font-normal">({business.services.filter(s => s.item_type !== "product").length})</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {business.services.filter(s => s.item_type !== "product").map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    return (
                      <div
                        key={svc.id}
                        onClick={() => openSpecCustomizer(svc)}
                        className={`bg-white rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between relative group hover:shadow-md ${
                          isSelected ? "border-[#00FFFF] ring-2 ring-[#00FFFF]/20 shadow-sm" : "border-slate-200 hover:border-slate-300 shadow-sm"
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {svc.category || "General"}
                            </span>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                In Cart ({getSelectedQty(svc.id)})
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-base text-slate-900 group-hover:text-[#EC008C] transition-colors mb-1">
                            {svc.name}
                          </h3>

                          <p className="text-sm font-extrabold text-slate-900 mb-3">
                            {svc.price_max && parseFloat(svc.price_max) > parseFloat(svc.price) 
                              ? `₱${Number(svc.price).toFixed(2)} – ₱${Number(svc.price_max).toFixed(2)}` 
                              : `From ₱${Number(svc.price).toFixed(2)}`}
                          </p>

                          {svc.image_url ? (
                            <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 p-2 overflow-hidden">
                              <img
                                src={svc.image_url}
                                alt={svc.name}
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                              <Package size={28} />
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>View Details & Order</span>
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-[#EC008C]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PRODUCTS */}
            {business.services.filter(s => s.item_type === "product").length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
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
                          if (outOfStock) return;
                          openSpecCustomizer(svc);
                        }}
                        className={`bg-white rounded-2xl border p-5 transition-all flex flex-col justify-between relative group hover:shadow-md ${
                          isSelected ? "border-[#EC008C] ring-2 ring-[#EC008C]/20 shadow-sm" : "border-slate-200 hover:border-slate-300 shadow-sm"
                        } ${outOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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
                            <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 p-2 overflow-hidden">
                              <img
                                src={svc.image_url}
                                alt={svc.name}
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-36 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                              <Package size={28} />
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>{outOfStock ? "Unavailable" : "Select Quantity"}</span>
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform text-[#EC008C]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* REVIEWS */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Star size={18} className="fill-amber-400 text-amber-400" /> Customer Reviews ({business.reviewCount})
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
          <aside className="space-y-6">

            {/* QR Payment Card */}
            {business.qr_url && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center justify-center gap-1.5">
                  <QrCode size={16} className="text-[#EC008C]" /> Downpayment QR Code
                </h3>
                <img
                  src={business.qr_url}
                  alt="Payment QR code"
                  className="mx-auto w-36 h-auto border border-slate-200 rounded-xl mb-2"
                />
                <p className="text-[11px] text-slate-500">Scan to pay downpayment via GCash, Maya, or online bank transfer.</p>
              </div>
            )}

            {/* Cart Summary Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-md relative overflow-hidden">
              <div className="cmyk-bar absolute top-0 left-0 right-0" />
              
              <h2 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
                Order Summary
              </h2>

              {selectedServices.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Your cart is empty. Select services or products above to proceed.
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  {selectedServices.map((s) => (
                    <div key={s.cart_item_id || s.id} className="flex justify-between items-start text-xs pb-3 border-b border-slate-100 last:border-0">
                      <div className="space-y-0.5 max-w-[70%]">
                        <p className="font-semibold text-slate-900">{s.name}</p>
                        <p className="text-slate-400 text-[11px]">Qty: {s.quantity || 1}</p>
                        
                        {s.selected_specs && (
                          <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 space-y-0.5">
                            {s.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-800">{s.selected_specs.size}</span></div>}
                            {s.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-800">{s.selected_specs.material}</span></div>}
                            {s.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-800">{s.selected_specs.quality}</span></div>}
                            {s.selected_specs.notes && <div className="text-amber-800 italic truncate">"Notes: {s.selected_specs.notes}"</div>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-slate-900">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => upsertServiceQuantity(s, 0)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600">Estimated Total</span>
                  <span className="text-2xl font-extrabold text-slate-900">
                    ₱{selectedServices.reduce((s, x) => s + Number(x.price) * (x.quantity || 1), 0).toFixed(2)}
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setSpecModalItem(null)}>
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
            <div className="cmyk-bar" />
            <button
              onClick={() => setSpecModalItem(null)}
              className="absolute right-4 top-5 p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
            >
              <X size={20} />
            </button>

            {(() => {
              const specs = specModalItem.specs_json || {};
              const modifiers = specs.price_modifiers || {};
              const basePrice = Number(specModalItem.price || 0);
              const sizeAddon = Number(modifiers[selectedSize] || 0);
              const materialAddon = Number(modifiers[selectedMaterial] || 0);
              const qualityAddon = Number(modifiers[selectedQuality] || 0);

              const unitPrice = basePrice + sizeAddon + materialAddon + qualityAddon;
              const qty = Math.max(1, parseInt(quantityInput, 10) || 1);
              const totalPrice = unitPrice * qty;

              return (
                <div className="p-6 sm:p-7 space-y-5">
                  <div className="flex items-start gap-4">
                    {specModalItem.image_url ? (
                      <img src={specModalItem.image_url} alt={specModalItem.name} className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Package size={24} />
                      </div>
                    )}
                    <div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        {specModalItem.category || "General Printing"}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 mt-1">{specModalItem.name}</h3>
                      <p className="text-xs text-slate-500">{specModalItem.item_type === "service" ? "Made to Order Custom Service" : "Physical Store Product"}</p>
                    </div>
                  </div>

                  {/* Size Selection */}
                  {specs.allowed_sizes && specs.allowed_sizes.length > 0 && (
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
                  {specs.allowed_materials && specs.allowed_materials.length > 0 && (
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
                  {specs.quality_levels && specs.quality_levels.length > 0 && (
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

                  {/* Custom Design Notes */}
                  {specModalItem.is_customizable !== false && (
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">Custom Artwork / Specs Notes (Optional)</label>
                      <textarea
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="e.g. Please add 3mm bleed margin, align header logos..."
                        rows={2}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#EC008C]"
                      />
                    </div>
                  )}

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
                        onClick={() => setQuantityInput(String((parseInt(quantityInput, 10) || 1) + 1))}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const cartItem = {
                          ...specModalItem,
                          price: unitPrice,
                          base_price: basePrice,
                          quantity: qty,
                          selected_specs: {
                            size: selectedSize || null,
                            material: selectedMaterial || null,
                            quality: selectedQuality || null,
                            notes: customNotes.trim() || null,
                          }
                        };

                        const matchKey = specModalItem.id + JSON.stringify(cartItem.selected_specs);
                        cartItem.cart_item_id = matchKey;

                        setSelectedServices((prev) => {
                          const existingIndex = prev.findIndex(s => (s.cart_item_id || s.id + JSON.stringify(s.selected_specs || {})) === matchKey);
                          if (existingIndex >= 0) {
                            const updated = [...prev];
                            // If they add the same spec combination again, increment quantity instead of overwriting
                            updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + qty };
                            return updated;
                          }
                          return [...prev, cartItem];
                        });

                        setSpecModalItem(null);
                      }}
                      className="px-6 py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-[#EC008C] transition-all flex items-center gap-2 shadow-md"
                    >
                      Add to Cart (₱{totalPrice.toFixed(2)}) <ArrowRight size={16} />
                    </button>
                  </div>

                </div>
              );
            })()}
          </div>
        </div>
      )}

    </main>
  );
}