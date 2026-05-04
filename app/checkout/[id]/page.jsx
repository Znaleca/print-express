"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { 
  ArrowRight, CreditCard, Loader2, Power, AlertTriangle, CheckCircle2,
  Package, MapPin, Truck, Clock, Banknote, X
} from "lucide-react";
import dynamic from "next/dynamic";

// Dynamic import for LocationPicker to avoid SSR issues
const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full animate-pulse bg-gray-200 border-2 border-dashed border-[#1A1A1A] flex items-center justify-center font-mono text-[10px] uppercase font-black tracking-widest text-[#1A1A1A]/40">Loading Map...</div>
});

// Manila timezone utilities
const MANILA_TIME_ZONE = "Asia/Manila";

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

  // Fulfillment State
  const [deliveryType, setDeliveryType] = useState("PICKUP"); // PICKUP, DELIVERY
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null); // { lat, lng }
  const [deliveryLocationLoading, setDeliveryLocationLoading] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState("NEED_NOW"); // NEED_NOW, ADVANCE
  const [expectedFulfillmentAt, setExpectedFulfillmentAt] = useState("");

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [minimumDownpaymentPercent, setMinimumDownpaymentPercent] = useState(0);
  const [userSelectedDownpaymentPercent, setUserSelectedDownpaymentPercent] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [businessId]);

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setIsCustomer(user.user_metadata?.role === "CUSTOMER" || user.user_metadata?.role === "customer");
      }

      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          *,
          services (
            id,
            name,
            price,
            stock_qty,
            available
          )
        `)
        .eq("id", businessId)
        .single();

      if (bizError) throw bizError;
      setBusiness(bizData);
      setIsClosed(checkBusinessClosed(bizData));
      
      // Minimum downpayment from DB
      setMinimumDownpaymentPercent(bizData.min_downpayment_percent ?? 50);

      // Load cart from localStorage
      const cartKey = `cart_${businessId}`;
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) {
        setSelectedServices(JSON.parse(savedCart));
      } else {
        // Empty cart, maybe redirect back?
        // router.push(`/business/${businessId}`);
      }

    } catch (error) {
      console.error("Error loading checkout data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
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

      // Check for Plus Code (e.g. "MGX8+3Q Abucay, Bataan")
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
          // If short, geocode the reference location first
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

      // Standard geocoding fallback
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
      } else {
        alert("Could not find location coordinates for this address. Please try being more specific or pin it manually.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert("Error finding location.");
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
          alert("Could not get your location. Please check browser permissions.");
          setDeliveryLocationLoading(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  const handleExecuteOrder = async () => {
    if (!isCustomer) return alert("Only registered customers can order.");
    if (isClosed) return alert("Shop is closed.");
    if (deliveryType === "DELIVERY" && !deliveryAddress) return alert("Please provide a delivery address.");
    if (fulfillmentMode === "ADVANCE" && !expectedFulfillmentAt) return alert("Please specify an expected date and time for your advance order.");
    if (selectedServices.length === 0) return alert("Cart is empty.");
    if (!receiptFile) return alert("Please upload your downpayment proof before executing the order.");

    setIsProcessing(true);

    try {
      // Ensure a chat conversation exists
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

      // Upload receipt if provided
      let receiptUrl = null;
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const filePath = `receipts/${userId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(filePath, receiptFile);
        if (uploadError) throw new Error("Failed to upload receipt: " + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
        receiptUrl = publicUrl;
      }

      const total = selectedServices.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
      const effectiveDownpaymentPercent = userSelectedDownpaymentPercent !== null ? userSelectedDownpaymentPercent : minimumDownpaymentPercent;
      const downpaymentAmt = total * (effectiveDownpaymentPercent / 100);
      const balanceAmt = total - downpaymentAmt;

      // Verify stock for products BEFORE inserting the order
      for (const item of selectedServices) {
        if (item.item_type === 'product') {
          const { data: productData } = await supabase
            .from('services')
            .select('stock_qty')
            .eq('id', item.id)
            .single();
          if (!productData || productData.stock_qty < (item.quantity || 1)) {
            throw new Error(`Insufficient stock for: ${item.name}. Available: ${productData?.stock_qty || 0}`);
          }
        }
      }

      // Build items jsonb (stored inline — no separate order_items table)
      const itemsPayload = selectedServices.map(item => ({
        id: item.id,
        name: item.name,
        item_type: item.item_type || 'service',
        quantity: item.quantity || 1,
        price: Number(item.price),
        design_url: item.designUrl || null,
        design_version: item.designVersion || null,
      }));

      // Insert Order with correct column names
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: userId,
          business_id: businessId,
          total,
          status: "PLACED",
          payment_method: paymentMethod,
          receipt_url: receiptUrl,
          items: itemsPayload,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "DELIVERY" ? deliveryAddress : null,
          delivery_coordinates: deliveryType === "DELIVERY" ? deliveryCoordinates : null,
          fulfillment_mode: fulfillmentMode,
          expected_fulfillment_at: fulfillmentMode === "ADVANCE" ? formatManilaDateTimeForDB(expectedFulfillmentAt) : null,
          downpayment_amount: downpaymentAmt,
          balance_amount: balanceAmt,
        })
        .select()
        .single();

      if (orderError) throw new Error("Order failed: " + orderError.message);

      // Decrement stock for products
      for (const item of selectedServices) {
        if (item.item_type === 'product') {
          const { data: productData } = await supabase
            .from('services').select('stock_qty').eq('id', item.id).single();
          if (productData) {
            await supabase.from('services')
              .update({ stock_qty: productData.stock_qty - (item.quantity || 1) })
              .eq('id', item.id);
          }
        }
      }

      // Mark quoted messages as ordered
      const quotedItems = selectedServices.filter(s => s.isQuotedCheckout && s.sourceMessageId);
      for (const qi of quotedItems) {
        const { data: msg } = await supabase.from('chat_messages').select('metadata').eq('id', qi.sourceMessageId).single();
        if (msg) {
          await supabase.from('chat_messages')
            .update({ metadata: { ...(msg.metadata || {}), ordered: true, orderId: order.id } })
            .eq('id', qi.sourceMessageId);
        }
      }

      // Clear cart and redirect to track
      localStorage.removeItem(`cart_${businessId}`);
      alert("Order successfully placed!");
      router.push(`/track`);

    } catch (error) {
      console.error("Checkout execution error:", error);
      alert(error.message || "Failed to execute order. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDFDFD] flex items-center justify-center font-sans text-[#1A1A1A]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={48} className="animate-spin text-[#00FFFF]" />
          <p className="font-mono text-xs font-black uppercase tracking-widest">INITIALIZING_CHECKOUT</p>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-[#FDFDFD] flex items-center justify-center font-sans text-[#1A1A1A]">
        <div className="text-center">
          <p className="font-mono text-xs font-black uppercase tracking-widest text-[#EC008C]">ERROR 404</p>
          <h1 className="text-4xl font-black uppercase italic mt-2">Shop Not Found</h1>
          <button onClick={() => router.push('/')} className="mt-8 border-4 border-[#1A1A1A] bg-[#00FFFF] px-6 py-3 font-mono text-xs font-black uppercase shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-y-1 hover:shadow-none transition-all">Go Home</button>
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
    !(deliveryType === "DELIVERY" && !deliveryAddress) &&
    !(fulfillmentMode === "ADVANCE" && !expectedFulfillmentAt) &&
    !!receiptFile;

  const setDownpaymentPercent = (val) => {
    setUserSelectedDownpaymentPercent(val);
  };

  const todayInManila = manilaDateString();
  const minAdvanceDateTime = manilaStartOfTomorrow();

  return (
    <>
      {/* QR PAYMENT MODAL */}
      {showQrModal && business.qr_url && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1A1A1A]/80 backdrop-blur-sm p-6"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="relative bg-white border-4 border-[#1A1A1A] shadow-[16px_16px_0px_0px_rgba(255,242,0,1)] max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white px-6 py-5 flex items-center justify-between border-b-4 border-[#FFF200]">
              <div>
                <h2 className="font-black uppercase italic tracking-widest text-base">QR_Payment</h2>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#FFF200]/70 mt-0.5">Scan to pay your downpayment</p>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center border-2 border-white/30 text-white hover:bg-white hover:text-[#1A1A1A] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* QR Image */}
            <div className="p-8 flex flex-col items-center gap-6">
              <div className="border-4 border-[#1A1A1A] overflow-hidden shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]" style={{ width: "220px", aspectRatio: "9/16" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={business.qr_url} alt="Payment QR" className="w-full h-full object-cover" />
              </div>
              <div className="w-full bg-[#FFF200] border-2 border-[#1A1A1A] px-4 py-3 text-center">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]">GCash / Maya / Bank Transfer</p>
                <p className="font-black italic text-2xl text-[#1A1A1A] mt-1">₱{downpaymentAmount.toFixed(2)} <span className="text-sm opacity-60">due now</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-[#FDFDFD] font-sans text-[#1A1A1A] selection:bg-[#00FFFF] selection:text-[#1A1A1A]">
        {/* STICKY HEADER */}
        <div className="sticky top-0 z-40 bg-[#1A1A1A] border-b-4 border-[#00FFFF] px-4 md:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/business/${business.id}`)}
            className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF] hover:text-[#FFF200] transition-colors"
          >
            <ArrowRight size={14} className="rotate-180" /> Back to Shop
          </button>
          <h1 className="font-black uppercase italic tracking-widest text-white text-sm md:text-base">Checkout_Portal</h1>
          <div className="font-mono text-[10px] font-black uppercase tracking-widest text-white/40">{business.name}</div>
        </div>

        <section className="mx-auto max-w-7xl px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">

            {/* ── LEFT: CHECKOUT FORM ── */}
            <div className="space-y-8 pb-32">

              {/* STEP 1: FULFILLMENT TYPE */}
              <div className="bg-white border-4 border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
                <div className="bg-[#1A1A1A] px-6 py-4 flex items-center gap-3">
                  <span className="font-mono text-[9px] font-black bg-[#00FFFF] text-[#1A1A1A] px-2 py-1">01</span>
                  <p className="font-black uppercase italic text-sm tracking-widest text-white">Fulfillment_Type</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDeliveryType("PICKUP")}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        deliveryType === 'PICKUP'
                          ? 'bg-[#00FFFF] border-[#1A1A1A] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}
                    >
                      <Package size={18} /> Pick_Up
                    </button>
                    <button
                      onClick={() => setDeliveryType("DELIVERY")}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        deliveryType === 'DELIVERY'
                          ? 'bg-[#EC008C] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}
                    >
                      <Truck size={18} /> Delivery
                    </button>
                  </div>

                  {deliveryType === "DELIVERY" && (
                    <div className="mt-2 p-5 bg-[#F9F9F7] border-4 border-[#1A1A1A] space-y-5">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-mono text-[10px] font-black uppercase tracking-widest opacity-80">Delivery Address</p>
                          <button type="button" onClick={getCurrentLocation} className="flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-widest text-[#EC008C] hover:text-[#00FFFF] transition-colors">
                            <MapPin size={10} /> Use My Location
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 border-2 border-[#1A1A1A] p-3 text-xs font-mono uppercase bg-white focus:outline-none focus:ring-2 focus:ring-[#00FFFF]"
                            placeholder="Address or Plus Code (e.g. MGX8+3Q)"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                          />
                          <button type="button" onClick={geocodeAddress} disabled={deliveryLocationLoading} className="inline-flex items-center justify-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase text-white hover:bg-[#00FFFF] hover:text-[#1A1A1A] disabled:opacity-50 transition-colors">
                            {deliveryLocationLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />} Pin
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] font-black uppercase tracking-widest mb-2 opacity-80 flex gap-2 items-center"><MapPin size={12} /> Pin on Map</p>
                      <div className="h-[300px] border-4 border-[#1A1A1A] overflow-hidden relative">
                        <LocationPicker
                          lat={deliveryCoordinates?.lat}
                          lng={deliveryCoordinates?.lng}
                          onChange={(lat, lng) => { setDeliveryCoordinates({ lat, lng }); reverseGeocode(lat, lng); }}
                        />
                      </div>
                        {deliveryLocationLoading && (
                          <p className="mt-2 font-mono text-[9px] font-black uppercase tracking-widest text-[#EC008C] flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Detecting location...</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: ORDER TIMING */}
              <div className="bg-white border-4 border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
                <div className="bg-[#1A1A1A] px-6 py-4 flex items-center gap-3">
                  <span className="font-mono text-[9px] font-black bg-[#EC008C] text-white px-2 py-1">02</span>
                  <p className="font-black uppercase italic text-sm tracking-widest text-white">Order_Timing</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => { setFulfillmentMode("NEED_NOW"); setExpectedFulfillmentAt(""); }}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        fulfillmentMode === 'NEED_NOW'
                          ? 'bg-[#00FFFF] border-[#1A1A1A] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}>
                      <Clock size={18} /> Need_Now
                    </button>
                    <button type="button" onClick={() => setFulfillmentMode("ADVANCE")}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        fulfillmentMode === 'ADVANCE'
                          ? 'bg-[#EC008C] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}>
                      <Clock size={18} /> Advance
                    </button>
                  </div>
                  {fulfillmentMode === "ADVANCE" && (
                    <div className="border-4 border-[#1A1A1A] bg-[#F9F9F7] p-4">
                      <p className="mb-2 font-mono text-[10px] font-black uppercase tracking-widest opacity-70">
                        Expected {deliveryType === "DELIVERY" ? "Delivery" : "Pick Up"} Date & Time
                      </p>
                      <input type="datetime-local" value={expectedFulfillmentAt} min={minAdvanceDateTime}
                        onChange={(e) => setExpectedFulfillmentAt(e.target.value)}
                        className="w-full border-2 border-[#1A1A1A] bg-white px-3 py-3 font-mono text-xs font-black uppercase tracking-wider outline-none focus:border-[#00FFFF]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 3: PAYMENT METHOD */}
              <div className="bg-white border-4 border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(255,242,0,1)]">
                <div className="bg-[#1A1A1A] px-6 py-4 flex items-center gap-3">
                  <span className="font-mono text-[9px] font-black bg-[#FFF200] text-[#1A1A1A] px-2 py-1">03</span>
                  <p className="font-black uppercase italic text-sm tracking-widest text-white">Balance_Payment_Method</p>
                </div>
                <div className="p-6">
                  <p className="font-mono text-[10px] opacity-50 uppercase font-bold mb-4">Balance after downpayment: <span className="text-[#EC008C]">{balanceAmount > 0 ? `₱${balanceAmount.toFixed(2)}` : 'FULLY PAID'}</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setPaymentMethod("COD")}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        paymentMethod === 'COD'
                          ? 'bg-[#FFF200] border-[#1A1A1A] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}>
                      <Banknote size={18} /> Cash (COD)
                    </button>
                    <button onClick={() => setPaymentMethod("E-Wallet")}
                      className={`py-5 border-4 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        paymentMethod === 'E-Wallet'
                          ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]'
                          : 'bg-white border-[#1A1A1A]/20 text-[#1A1A1A] opacity-60 hover:opacity-100 hover:border-[#1A1A1A]'
                      }`}>
                      <CreditCard size={18} /> E-Wallet
                    </button>
                  </div>
                </div>
              </div>

              {/* STEP 4: UPLOAD RECEIPT */}
              <div className="overflow-hidden border-4 border-[#1A1A1A] bg-white shadow-[10px_10px_0px_0px_rgba(236,0,140,1)]">
                <div className="bg-[#1A1A1A] px-6 py-5 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center border-2 border-white bg-[#FFF200] px-2 py-1 font-mono text-[9px] font-black uppercase tracking-widest text-[#1A1A1A]">04</span>
                      <div>
                        <p className="font-mono text-[9px] font-black uppercase tracking-[0.35em] text-[#FFF200]">Payment_Proof</p>
                        <p className="font-black uppercase italic text-lg tracking-[0.08em] leading-none">Downpayment or Pay Full</p>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 border-2 border-white/20 px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.25em] text-white/70">
                      <span className="h-2 w-2 bg-[#00FFFF]" /> Secure Upload
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-[#F9F9F7] space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="border-4 border-[#1A1A1A] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
                      <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-black/40">Downpayment</p>
                      <p className="mt-1 text-2xl font-black italic leading-none text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</p>
                    </div>
                    <div className="border-4 border-[#1A1A1A] bg-white p-4 shadow-[4px_4px_0px_0px_rgba(255,242,0,1)]">
                      <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-black/40">Pay Full</p>
                      <p className="mt-1 text-2xl font-black italic leading-none text-[#1A1A1A]">₱{total.toFixed(2)}</p>
                    </div>
                  </div>

                  <p className="font-mono text-[10px] font-black uppercase tracking-widest opacity-60">
                    Upload your payment proof below to continue.
                  </p>
                  {business.qr_url && (
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="inline-flex items-center justify-center gap-2 border-2 border-[#1A1A1A] bg-[#1A1A1A] px-4 py-3 font-mono text-[10px] font-black uppercase text-white hover:bg-[#FFF200] hover:text-[#1A1A1A] transition-colors shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                    >
                      <Banknote size={14} /> View QR Code to Pay
                    </button>
                  )}
                  <input type="file" accept="image/*" onChange={handleReceiptUpload}
                    className="text-xs font-mono w-full file:mr-4 file:py-2 file:px-4 file:border-2 file:border-[#1A1A1A] file:text-xs file:font-black file:uppercase file:bg-white hover:file:bg-[#FFF200] cursor-pointer"
                  />
                  {receiptPreview && (
                    <div className="border-4 border-[#1A1A1A] p-2 bg-white max-w-[220px] shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={receiptPreview} alt="Receipt Preview" className="w-full h-auto object-contain" />
                    </div>
                  )}
                  {receiptFile && (
                    <div className="flex items-center gap-2 text-[10px] text-[#EC008C] font-black uppercase">
                      <CheckCircle2 size={14} /> {receiptFile.name}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── RIGHT: ORDER SUMMARY (STICKY) ── */}
            <aside className="lg:sticky lg:top-20 h-fit space-y-6">

              {/* ORDER SUMMARY CARD */}
              <div className="bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
                <div className="bg-[#1A1A1A] text-white px-6 py-5 border-b-4 border-[#00FFFF]">
                  <h2 className="font-black uppercase italic tracking-widest text-base">Order_Summary</h2>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#00FFFF]/70 mt-1">{business.name}</p>
                </div>

                {/* Items list */}
                <div className="divide-y-2 divide-dashed divide-[#1A1A1A]/10">
                  {selectedServices.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="font-mono text-[10px] font-black uppercase opacity-30">Cart is empty</p>
                    </div>
                  ) : (
                    selectedServices.map((s) => (
                      <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-black uppercase italic text-sm leading-tight">{s.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-[9px] uppercase font-bold opacity-40">×{s.quantity || 1}</span>
                            {s.isQuotedCheckout && s.designVersion && (
                              <span className="bg-[#1A1A1A] text-white font-mono text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5">v{s.designVersion}</span>
                            )}
                          </div>
                          {s.isQuotedCheckout && s.designUrl && (
                            <div className="mt-2 border-2 border-[#1A1A1A]/20 overflow-hidden" style={{width: '60px', height: '60px'}}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.designUrl} alt="Design" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-sm font-black text-[#1A1A1A] shrink-0">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Totals */}
                <div className="border-t-4 border-[#1A1A1A] bg-[#F9F9F7] p-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-black opacity-50">Subtotal</span>
                    <span className="font-mono text-sm font-black">₱{total.toFixed(2)}{selectedServices.some(s => s.item_type !== "product") ? "+" : ""}</span>
                  </div>

                  {/* Downpayment Slider */}
                  <div className="pt-4 border-t-2 border-dashed border-[#1A1A1A]/20">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-black opacity-50">Downpayment</span>
                      <span className="font-mono text-[11px] font-black text-[#EC008C] bg-white border-2 border-[#EC008C] px-2 py-0.5">{effectiveDownpaymentPercent}%</span>
                    </div>
                    <input type="range" min={minimumDownpaymentPercent} max="100" step="5"
                      value={effectiveDownpaymentPercent}
                      onChange={(e) => setDownpaymentPercent(Number(e.target.value))}
                      className="w-full h-2 bg-[#1A1A1A]/10 appearance-none cursor-pointer accent-[#EC008C]"
                    />
                    <p className="font-mono text-[8px] uppercase opacity-40 mt-1">Min: {minimumDownpaymentPercent}% &nbsp;|&nbsp; Max: 100%</p>
                  </div>

                  <div className="flex justify-between items-end pt-3 border-t-2 border-dashed border-[#1A1A1A]/20">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-black text-[#EC008C]">Pay Now</span>
                    <span className="text-3xl font-black italic leading-none text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</span>
                  </div>
                  {business.qr_url && (
                    <div className="pt-4 mt-2 border-t-2 border-dashed border-[#1A1A1A]/20">
                      <button
                        type="button"
                        onClick={() => setShowQrModal(true)}
                        className="w-full flex items-center justify-center gap-2 font-mono text-[10px] font-black uppercase tracking-widest text-white bg-[#1A1A1A] border-2 border-[#1A1A1A] px-4 py-3 hover:bg-[#FFF200] hover:text-[#1A1A1A] transition-colors shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-y-1 active:shadow-none"
                      >
                        <Banknote size={16} /> View QR Code to Pay
                      </button>
                    </div>
                  )}
                  {balanceAmount > 0 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] font-black opacity-40">Balance Later</span>
                      <span className="font-mono text-sm font-black opacity-40">₱{balanceAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* NOTICE */}
              <div className="p-4 border-2 border-dashed border-[#1A1A1A]/20 bg-[#F9F9F7]">
                <p className="font-mono text-[9px] font-bold uppercase leading-relaxed opacity-50">
                  // By submitting, you agree to version control V1 of uploaded assets. Initial proofing begins within 24 hours.
                </p>
              </div>

              {/* EXECUTE ORDER */}
              <div className="pt-4">
                {!isCustomer ? (
                  <div className="bg-white text-[#EC008C] border-4 border-[#EC008C] p-6 font-mono text-[11px] font-bold uppercase tracking-wider text-center flex flex-col gap-3 shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
                    <AlertTriangle size={32} className="mx-auto" />
                    Auth Required: Only registered CUSTOMERS can place orders.
                  </div>
                ) : isClosed ? (
                  <div className="bg-[#1A1A1A] text-white border-4 border-[#1A1A1A] p-6 font-mono text-[11px] font-bold uppercase tracking-wider text-center flex flex-col gap-3">
                    <Power size={32} className="mx-auto opacity-40" />
                    Shop is currently closed. Orders are disabled.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-black/40 text-center px-2">
                      Complete all required details to unlock execute order.
                    </p>
                    <button
                      onClick={handleExecuteOrder}
                      disabled={isProcessing || !isReadyToExecute}
                      className="w-full bg-[#1A1A1A] text-white py-6 px-6 font-black uppercase italic text-xl flex items-center justify-center gap-3 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] disabled:opacity-50 disabled:shadow-none translate-y-0 active:translate-y-2 active:shadow-none group"
                    >
                      {isProcessing ? (
                        <><Loader2 size={24} className="animate-spin" /> EXECUTING...</>
                      ) : (
                        <>EXECUTE_ORDER <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" /></>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </aside>
          </div>
        </section>

      </main>
    </>
  );
}