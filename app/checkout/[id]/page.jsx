"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { 
  ArrowRight, CreditCard, Loader2, Power, AlertTriangle, CheckCircle2,
  Package, MapPin, Truck, Clock, Banknote, X, QrCode, ShieldCheck, FileText, ChevronRight
} from "lucide-react";
import dynamic from "next/dynamic";
import { normalizePhilippinePhone } from "@/lib/phone";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full rounded-xl bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-400">
      Loading Location Map...
    </div>
  )
});

const MANILA_TIME_ZONE = "Asia/Manila";

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

function getManilaDateObj() {
  const now = new Date();
  const options = { timeZone: MANILA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  return new Date(`${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`);
}

function manilaDateString() {
  const mDate = getManilaDateObj();
  const pad = (n) => String(n).padStart(2, '0');
  return `${mDate.getFullYear()}-${pad(mDate.getMonth()+1)}-${pad(mDate.getDate())}`;
}

function manilaStartOfTomorrow() {
  const mDate = getManilaDateObj();
  mDate.setDate(mDate.getDate() + 1);
  mDate.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${mDate.getFullYear()}-${pad(mDate.getMonth()+1)}-${pad(mDate.getDate())}T00:00`;
}

function formatManilaDateTimeForDB(dtString) {
  if (!dtString) return null;
  const dt = new Date(dtString);
  const utcMs = dt.getTime() - (8 * 60 * 60 * 1000);
  return new Date(utcMs).toISOString();
}

function checkBusinessClosed(business) {
  if (!business) return false;
  if (!business.is_open) return true;
  if (!business.operating_hours || !business.operating_hours.enabled) return false;
  
  const mDate = getManilaDateObj();
  const dayIndex = mDate.getDay();
  const daysMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = daysMap[dayIndex];
  
  const todaySchedule = business.operating_hours[currentDay];
  if (!todaySchedule || !todaySchedule.is_open) return true;
  
  const currentHourStr = mDate.getHours().toString().padStart(2, '0') + ':' + mDate.getMinutes().toString().padStart(2, '0');
  if (currentHourStr < todaySchedule.open || currentHourStr > todaySchedule.close) {
    return true;
  }
  return false;
}

export default function CheckoutPage({ params }) {
  const resolvedParams = use(params);
  const businessId = resolvedParams.id;
  const router = useRouter();

  // State
  const [business, setBusiness] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [isCustomer, setIsCustomer] = useState(false);
  const [userId, setUserId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState(null);

  // Fulfillment State
  const [deliveryType, setDeliveryType] = useState("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
  const [deliveryLocationLoading, setDeliveryLocationLoading] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState("NEED_NOW");
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [minimumDownpaymentPercent, setMinimumDownpaymentPercent] = useState(0);
  const [userSelectedDownpaymentPercent, setUserSelectedDownpaymentPercent] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [designFilesToView, setDesignFilesToView] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, [businessId]);

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const metadataRole = String(user.user_metadata?.role || "").toUpperCase();
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, role")
          .eq("id", user.id)
          .maybeSingle();
        setIsCustomer(metadataRole === "CUSTOMER" || String(profile?.role || "").toUpperCase() === "CUSTOMER");
        setCustomerPhone(profile?.phone || user.user_metadata?.phone || "");
      }

      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          *,
          services (
            id,
            name,
            price,
            image_url,
            stock_qty,
            available
          )
        `)
        .eq("id", businessId)
        .single();

      if (bizError) throw bizError;
      setBusiness(bizData);
      setIsClosed(checkBusinessClosed(bizData));
      
      setMinimumDownpaymentPercent(bizData.min_downpayment_percent ?? 50);

      const cartKey = `cart_${businessId}`;
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) {
        const savedItems = JSON.parse(savedCart);
        setSelectedServices(savedItems.map((item) => {
          const service = (bizData.services || []).find((candidate) => candidate.id === item.id);
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
        }));
      }

    } catch (error) {
      console.error("Error loading checkout data:", error);
      setLoadError(error?.message || "We could not load this checkout. Please return to the shop and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const optimized = await optimizeImageForUpload(file);
        setReceiptFile(optimized);
        setReceiptPreview(URL.createObjectURL(optimized));
      } catch (error) {
        setReceiptFile(null);
        setReceiptPreview(null);
        setCheckoutMessage({ type: "error", text: error.message || "Could not optimize this image." });
      }
    } else {
      setReceiptFile(null);
      setReceiptPreview(null);
    }
  };

  const geocodeAddress = async () => {
    if (!deliveryAddress) return;
    setDeliveryLocationLoading(true);
    try {
      let lat, lng;
      const addressToSearch = deliveryAddress.trim();

      const parts = addressToSearch.split(/[\s,]+/);
      const potentialCode = parts[0];

      if (potentialCode.includes("+")) {
        const { OpenLocationCode } = await import("open-location-code");
        const olc = new OpenLocationCode();

        if (olc.isFull(potentialCode)) {
          const decoded = olc.decode(potentialCode);
          lat = decoded.latitudeCenter;
          lng = decoded.longitudeCenter;
        } else if (olc.isShort(potentialCode) && parts.length > 1) {
          const referenceLoc = addressToSearch.replace(potentialCode, "").trim();
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(referenceLoc)}`, { headers: { 'User-Agent': 'print-app-v1' }});
          const data = await res.json();

          if (data && data.length > 0) {
            const refLat = Number.parseFloat(data[0].lat);
            const refLng = Number.parseFloat(data[0].lon);
            const fullCode = olc.recoverNearest(potentialCode, refLat, refLng);
            const decoded = olc.decode(fullCode);
            lat = decoded.latitudeCenter;
            lng = decoded.longitudeCenter;
          }
        }
      }

      if (!lat || !lng) {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressToSearch)}`, { headers: { 'User-Agent': 'print-app-v1' }});
        const data = await res.json();
        if (data && data.length > 0) {
          lat = Number.parseFloat(data[0].lat);
          lng = Number.parseFloat(data[0].lon);
        }
      }

      if (lat && lng) {
        setDeliveryCoordinates({ lat, lng });
        setCheckoutMessage({ type: "success", text: "Address pinned on the map." });
      } else {
        setCheckoutMessage({ type: "error", text: "Could not find this address. Adjust it or place the pin on the map." });
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setCheckoutMessage({ type: "error", text: "We could not locate that address. You can place the pin manually." });
    } finally {
      setDeliveryLocationLoading(false);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    setDeliveryLocationLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        setDeliveryAddress(data.display_name);
      }
    } catch (err) {
      console.error("Reverse geocoding error:", err);
    } finally {
      setDeliveryLocationLoading(false);
    }
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setDeliveryLocationLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setDeliveryCoordinates({ lat, lng });
          reverseGeocode(lat, lng);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setCheckoutMessage({ type: "error", text: "Could not get your location. Check browser permissions or place the pin manually." });
          setDeliveryLocationLoading(false);
        }
      );
    } else {
      setCheckoutMessage({ type: "error", text: "Location is not supported by this browser. Place the pin manually." });
    }
  };

  const handleExecuteOrder = async () => {
    const rejectOrder = (text) => {
      setCheckoutMessage({ type: "error", text });
      return false;
    };

    if (!isCustomer) return rejectOrder("Sign in with a customer account before placing an order.");
    if (isClosed) return rejectOrder("This shop is currently closed and cannot accept new orders.");
    if (deliveryType === "DELIVERY" && !deliveryAddress) return rejectOrder("Add a delivery address before placing your order.");
    if (fulfillmentMode === "ADVANCE" && !expectedFulfillmentAt) return rejectOrder("Choose the date and time for your scheduled order.");
    if (selectedServices.length === 0) return rejectOrder("Your cart is empty. Add a product or service first.");
    if (!receiptFile) return rejectOrder("Upload your payment proof before placing the order.");

    setIsProcessing(true);
    setCheckoutMessage(null);

    try {
      const { data: existingConv } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("customer_id", userId)
        .eq("business_id", businessId)
        .maybeSingle();

      let convId = existingConv?.id;
      if (!convId) {
        const { data: newConv, error: convError } = await supabase
          .from("chat_conversations")
          .upsert(
            { customer_id: userId, business_id: businessId },
            { onConflict: "business_id,customer_id" }
          )
          .select()
          .single();
        if (convError) throw new Error("Could not create conversation: " + convError.message);
        convId = newConv.id;
      }

      let receiptUrl = null;
      if (receiptFile) {
        const optimizedReceipt = await optimizeImageForUpload(receiptFile);
        const fileExt = getUploadExtension(optimizedReceipt);
        const filePath = `receipts/${userId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(filePath, optimizedReceipt, {
            cacheControl: "31536000",
            contentType: optimizedReceipt.type,
          });
        if (uploadError) throw new Error("Failed to upload payment proof: " + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);
        receiptUrl = publicUrl;
      }

      const effectiveDownpaymentPercent = userSelectedDownpaymentPercent !== null ? userSelectedDownpaymentPercent : minimumDownpaymentPercent;
      const normalizedPhone = normalizePhilippinePhone(customerPhone);
      if (!normalizedPhone) {
        throw new Error("Enter a valid Philippine mobile number for SMS updates. Example: 09171234567 or +639171234567.");
      }

      const itemsPayload = selectedServices.map(item => ({
        id: item.id,
        name: item.name,
        item_type: item.item_type || 'service',
        quantity: item.quantity || 1,
        price: Number(item.price),
        design_url: item.designUrl || null,
        design_file_name: item.designFileName || null,
        design_file_type: item.designFileType || null,
        design_file_size: item.designFileSize || null,
        design_files: getDesignFiles(item),
        design_urls: getDesignFiles(item).map((file) => file.url).filter(Boolean),
        design_version: item.designVersion || null,
        selected_specs: item.selected_specs || null,
        is_quoted_checkout: Boolean(item.isQuotedCheckout),
        source_message_id: item.sourceMessageId || null,
      }));

      const { data: orderId, error: orderError } = await supabase.rpc("place_order_atomic", {
        p_business_id: businessId,
        p_items: itemsPayload,
        p_order: {
          payment_method: paymentMethod,
          receipt_url: receiptUrl,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "DELIVERY" ? deliveryAddress : null,
          delivery_coordinates: deliveryType === "DELIVERY" ? deliveryCoordinates : null,
          fulfillment_mode: fulfillmentMode,
          expected_fulfillment_at: fulfillmentMode === "ADVANCE" ? formatManilaDateTimeForDB(expectedFulfillmentAt) : null,
          customer_phone: normalizedPhone,
          downpayment_percent: effectiveDownpaymentPercent,
        },
      });

      if (orderError || !orderId) {
        throw new Error("Order failed: " + (orderError?.message || "The checkout transaction did not complete."));
      }
      const order = { id: orderId };

      const quotedItems = selectedServices.filter(s => s.isQuotedCheckout && s.sourceMessageId);
      for (const qi of quotedItems) {
        const { data: msg } = await supabase.from('chat_messages').select('metadata').eq('id', qi.sourceMessageId).single();
        if (msg) {
          await supabase.from('chat_messages')
            .update({ metadata: { ...(msg.metadata || {}), ordered: true, orderId: order.id } })
            .eq('id', qi.sourceMessageId);
        }
      }

      localStorage.removeItem(`cart_${businessId}`);
      router.push(`/track`);

    } catch (error) {
      console.error("Checkout execution error:", error);
      setCheckoutMessage({ type: "error", text: error.message || "Failed to place the order. Please try again." });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Preparing checkout...</p>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-900 p-6">
        <div className="text-center bg-white border border-slate-200 rounded-2xl p-10 shadow-xl max-w-sm">
          <AlertTriangle size={28} className="mx-auto mb-4 text-[#EC008C]" />
          <h1 className="text-xl font-bold">Checkout unavailable</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">{loadError || "The shop details could not be loaded."}</p>
          <button onClick={() => router.push('/')} className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-[#EC008C] transition-colors">
            Return Home
          </button>
        </div>
      </main>
    );
  }

  const total = selectedServices.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
  const effectiveDownpaymentPercent = userSelectedDownpaymentPercent !== null ? userSelectedDownpaymentPercent : minimumDownpaymentPercent;
  const downpaymentAmount = total * (effectiveDownpaymentPercent / 100);
  const balanceAmount = total - downpaymentAmount;
  const isReadyToExecute =
    selectedServices.length > 0 &&
    isCustomer &&
    !isClosed &&
    Boolean(normalizePhilippinePhone(customerPhone)) &&
    !(deliveryType === "DELIVERY" && !deliveryAddress) &&
    !(fulfillmentMode === "ADVANCE" && !expectedFulfillmentAt) &&
    !!receiptFile;

  const minAdvanceDateTime = manilaStartOfTomorrow();

  return (
    <>
      {/* QR PAYMENT MODAL */}
      {showQrModal && business.qr_url && (
        <div
          className="dialog-overlay"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="dialog-surface attachment-dialog relative max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cmyk-bar" />
            <div className="p-6 text-center space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <QrCode size={16} className="text-[#EC008C]" /> Payment QR Code
                </h2>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              <img src={business.qr_url} alt="Payment QR" className="mx-auto w-44 h-auto rounded-xl border border-white/20" />
              
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/15">
                <p className="text-xs text-white/60 font-medium">GCash / Maya / Bank Transfer</p>
                <p className="text-xl font-extrabold text-white mt-0.5">₱{downpaymentAmount.toFixed(2)} <span className="text-xs font-normal text-white/50">downpayment</span></p>
              </div>
            </div>
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

      <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-sm">
          <button
            onClick={() => router.push(`/business/${business.id}`)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowRight size={14} className="rotate-180 text-slate-400" /> Back to Shop
          </button>
          <h1 className="font-bold text-slate-900 text-sm md:text-base">Order Checkout</h1>
          <span className="text-xs text-slate-500 truncate max-w-[140px] sm:max-w-none">{business.name}</span>
        </div>

        {checkoutMessage && (
          <div
            role="status"
            className={`mx-auto mt-4 flex max-w-[1600px] items-start gap-2 px-4 text-xs font-semibold md:px-8 ${
              checkoutMessage.type === "success" ? "text-[#008C8C]" : "text-rose-700"
            }`}
          >
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${checkoutMessage.type === "success" ? "bg-[#009FA0]" : "bg-rose-500"}`} />
            <span>{checkoutMessage.text}</span>
          </div>
        )}

        <section className="mx-auto max-w-[1600px] px-4 md:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">

            {/* LEFT: CHECKOUT STEPS */}
            <div className="space-y-6">

              {!isCustomer && (
                <div className="flex flex-col gap-3 border border-[#EC008C]/25 bg-[#EC008C]/[0.05] p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-slate-900">Customer sign-in required</p>
                    <p className="mt-1 text-slate-500">Sign in to submit this order and receive SMS updates.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="shrink-0 bg-slate-900 px-4 py-2.5 font-bold text-white transition-colors hover:bg-[#EC008C]"
                  >
                    Sign in to continue
                  </button>
                </div>
              )}

              {/* STEP 0: ORDER REVIEW */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">0</span>
                  <div>
                    <h2 className="font-bold text-sm text-slate-900">Review Customization & Cost Estimate</h2>
                    <p className="text-[11px] text-slate-500">Ordering starts after your size, material, quality, and quantity estimate is confirmed.</p>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {selectedServices.map((s, idx) => {
                    const qty = s.quantity || 1;
                    const unit = Number(s.price || 0);
                    return (
                      <div key={s.cart_item_id || `${s.id}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="font-bold text-slate-900">{s.name}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {s.item_type === "product"
                                ? "Ready-made product — no customization required."
                                : `Baseline: ${s.selected_specs?.size || "Default size"} / ${s.selected_specs?.material || "Default material"} / ${s.selected_specs?.quality || "Standard quality"}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-900">Qty {qty}</p>
                            <p className="text-[11px] text-slate-500">Unit PHP {unit.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
                          <span>Estimated line total</span>
                          <span>PHP {(unit * qty).toFixed(2)}</span>
                        </div>
                        {s.selected_specs?.notes && <p className="mt-2 text-[11px] italic text-amber-700">Order notes: {s.selected_specs.notes}</p>}
                        {getDesignFiles(s).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDesignFilesToView(getDesignFiles(s))}
                            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#009FA0] hover:text-[#EC008C]"
                          >
                            <FileText size={13} /> View files ({getDesignFiles(s).length})
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STEP 1: FULFILLMENT TYPE */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">1</span>
                  <h2 className="font-bold text-sm text-slate-900">Select Fulfillment Method</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Customer Mobile Number for SMS Updates</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 09XXXXXXXXX or +639XXXXXXXXX"
                      className="w-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium rounded-xl outline-none focus:ring-2 focus:ring-[#00FFFF]"
                    />
                        <p className="mt-1 text-[11px] text-slate-500">SMS updates are sent when your order is placed, ready for pickup or out for delivery, completed, or cancelled.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDeliveryType("PICKUP")}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        deliveryType === 'PICKUP'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Package size={16} /> Store Pickup
                    </button>
                    <button
                      onClick={() => setDeliveryType("DELIVERY")}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        deliveryType === 'DELIVERY'
                          ? 'bg-[#EC008C] text-white border-[#EC008C] shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Truck size={16} /> Local Delivery
                    </button>
                  </div>

                  {deliveryType === "DELIVERY" && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-slate-700">Delivery Address</label>
                          <button type="button" onClick={getCurrentLocation} className="text-xs font-medium text-[#EC008C] flex items-center gap-1 hover:underline">
                            <MapPin size={12} /> Use My Location
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#00FFFF]"
                            placeholder="Full address or Plus Code"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                          />
                          <button type="button" onClick={geocodeAddress} disabled={deliveryLocationLoading} className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shrink-0">
                            {deliveryLocationLoading ? <Loader2 size={14} className="animate-spin" /> : "Pin Address"}
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Pin Location on Map</label>
                        <div className="h-[280px] rounded-xl border border-slate-200 overflow-hidden relative">
                          <LocationPicker
                            lat={deliveryCoordinates?.lat}
                            lng={deliveryCoordinates?.lng}
                            onChange={(lat, lng) => { setDeliveryCoordinates({ lat, lng }); reverseGeocode(lat, lng); }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: ORDER TIMING */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">2</span>
                  <h2 className="font-bold text-sm text-slate-900">Fulfillment Schedule</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => { setFulfillmentMode("NEED_NOW"); setExpectedFulfillmentAt(""); }}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        fulfillmentMode === 'NEED_NOW'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                      <Clock size={16} /> As Soon As Possible
                    </button>
                    <button type="button" onClick={() => setFulfillmentMode("ADVANCE")}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        fulfillmentMode === 'ADVANCE'
                          ? 'bg-[#EC008C] text-white border-[#EC008C] shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                      <Clock size={16} /> Scheduled Date & Time
                    </button>
                  </div>

                  {fulfillmentMode === "ADVANCE" && (
                    <div className="border border-slate-200 bg-slate-50 p-4 rounded-xl">
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Expected {deliveryType === "DELIVERY" ? "Delivery" : "Pickup"} Date & Time
                      </label>
                      <input 
                        type="datetime-local" 
                        value={expectedFulfillmentAt} 
                        min={minAdvanceDateTime}
                        onChange={(e) => setExpectedFulfillmentAt(e.target.value)}
                        className="w-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium rounded-xl outline-none focus:ring-2 focus:ring-[#00FFFF]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 3: PAYMENT METHOD */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">3</span>
                  <h2 className="font-bold text-sm text-slate-900">Remaining Balance Payment Method</h2>
                </div>
                <div className="p-6 space-y-3">
                  <p className="text-xs text-slate-500">
                    Remaining balance after downpayment: <strong className="text-slate-900">₱{balanceAmount > 0 ? balanceAmount.toFixed(2) : '0.00'}</strong>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setPaymentMethod("COD")}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentMethod === 'COD'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                      <Banknote size={16} /> Cash (On Pickup / Delivery)
                    </button>
                    <button onClick={() => setPaymentMethod("E-Wallet")}
                      className={`py-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentMethod === 'E-Wallet'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                      <CreditCard size={16} /> E-Wallet
                    </button>
                  </div>
                </div>
              </div>

              {/* STEP 4: UPLOAD RECEIPT */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">4</span>
                  <h2 className="font-bold text-sm text-slate-900">Upload Payment Proof</h2>
                </div>

                <div className="p-6 space-y-4">
                  {business.qr_url && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                      <h3 className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                        <QrCode size={16} className="text-[#EC008C]" /> Downpayment QR Code
                      </h3>
                      <Image
                        src={business.qr_url}
                        alt="Payment QR code"
                        width={176}
                        height={176}
                        className="mx-auto mb-3 h-44 w-44 rounded-xl border border-slate-200 bg-white object-contain"
                      />
                      <p className="text-[11px] text-slate-500">Scan to pay your downpayment via GCash, Maya, or online bank transfer.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Downpayment Due</span>
                      <span className="text-xl font-extrabold text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Full Amount</span>
                      <span className="text-xl font-extrabold text-slate-900">₱{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {business.qr_url && (
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <QrCode size={16} className="text-[#EC008C]" /> View Payment QR Code
                    </button>
                  )}

                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-slate-300 transition-colors">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleReceiptUpload}
                      className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-[#EC008C] cursor-pointer"
                    />
                  </div>

                  {receiptPreview && (
                    <div className="border border-slate-200 rounded-xl p-2 max-w-[200px]">
                      <img src={receiptPreview} alt="Receipt Preview" className="w-full h-auto rounded-lg object-contain" />
                    </div>
                  )}

                  {receiptFile && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold">
                      <CheckCircle2 size={16} /> {receiptFile.name} uploaded
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT: ORDER SUMMARY (STICKY) */}
            <aside className="lg:sticky lg:top-20 space-y-6">

              <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 relative overflow-hidden">
                <div className="cmyk-bar absolute top-0 left-0 right-0" />

                <h2 className="font-bold text-base text-slate-900 mb-4 pb-3 border-b border-slate-100">
                  Order Summary
                </h2>

                <div className="mb-6 space-y-5">
                  {getCartGroups(selectedServices).map((group) => (
                    <section key={group.key}>
                      <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {group.label}
                      </h3>
                      <div className="space-y-3">
                        {group.items.map((s, idx) => (
                    <div key={s.cart_item_id || `${s.id}-${idx}`} className="flex justify-between items-start text-xs pb-3 border-b border-slate-100 last:border-0">
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
                          <p className="font-bold text-slate-900">{s.name || s.item_name || s.service_name || "Print item"}</p>
                          <p className="text-slate-500 text-[11px]">Quantity: {s.quantity || 1}</p>
                        
                        {s.selected_specs && (s.selected_specs.size || s.selected_specs.material || s.selected_specs.quality || s.selected_specs.notes) && (
                          <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 space-y-0.5">
                            {s.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-800">{s.selected_specs.size}</span></div>}
                            {s.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-800">{s.selected_specs.material}</span></div>}
                            {s.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-800">{s.selected_specs.quality}</span></div>}
                            {s.selected_specs.notes && <div className="text-amber-800 italic">"Notes: {s.selected_specs.notes}"</div>}
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
                      <span className="font-bold text-slate-900 shrink-0">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                    </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex justify-between text-xs text-slate-600 font-medium">
                    <span>Subtotal</span>
                    <span>₱{total.toFixed(2)}</span>
                  </div>

                  {/* Downpayment Slider */}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-1.5 text-xs">
                      <span className="font-semibold text-slate-700">Downpayment Percent</span>
                      <span className="font-bold text-[#EC008C]">{effectiveDownpaymentPercent}%</span>
                    </div>
                    <input 
                      type="range" 
                      min={minimumDownpaymentPercent} 
                      max="100" 
                      step="5"
                      value={effectiveDownpaymentPercent}
                      onChange={(e) => setUserSelectedDownpaymentPercent(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#EC008C]"
                    />
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-semibold text-slate-700">Downpayment Due Now</span>
                    <span className="text-xl font-extrabold text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</span>
                  </div>

                  {balanceAmount > 0 && (
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Remaining Balance</span>
                      <span>₱{balanceAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <button
                    onClick={handleExecuteOrder}
                    disabled={isProcessing || !isReadyToExecute}
                    className="w-full bg-slate-900 text-white py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50 mt-4"
                  >
                    {isProcessing ? (
                      <><Loader2 size={16} className="animate-spin" /> Processing Order...</>
                    ) : (
                      <>Place Order <ArrowRight size={16} /></>
                    )}
                  </button>

                  {!isReadyToExecute && (
                    <p className="text-[11px] text-slate-400 text-center mt-2">
                      Please complete all required fields and upload payment proof to submit order.
                    </p>
                  )}
                </div>
              </div>

            </aside>
          </div>
        </section>

      </main>
    </>
  );
}
