"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { 
  ArrowRight, CreditCard, Loader2, Power, AlertTriangle, CheckCircle2,
  Package, MapPin, Truck, Clock, Banknote, X, QrCode, ShieldCheck
} from "lucide-react";
import dynamic from "next/dynamic";
import { normalizePhilippinePhone } from "@/lib/phone";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full rounded-xl bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-400">
      Loading Location Map...
    </div>
  )
});

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

  useEffect(() => {
    fetchInitialData();
  }, [businessId]);

  const fetchInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setIsCustomer(user.user_metadata?.role === "CUSTOMER" || user.user_metadata?.role === "customer");
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();
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
        setSelectedServices(JSON.parse(savedCart));
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
      } else {
        alert("Could not find coordinates for this address. Please adjust or pin on map.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert("Error locating address.");
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
    if (isClosed) return alert("Shop is currently closed.");
    if (deliveryType === "DELIVERY" && !deliveryAddress) return alert("Please provide a delivery address.");
    if (fulfillmentMode === "ADVANCE" && !expectedFulfillmentAt) return alert("Please specify an expected date and time.");
    if (selectedServices.length === 0) return alert("Your cart is empty.");
    if (!receiptFile) return alert("Please upload your payment proof before placing the order.");

    setIsProcessing(true);

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
        const fileExt = receiptFile.name.split('.').pop();
        const filePath = `receipts/${userId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(filePath, receiptFile);
        if (uploadError) throw new Error("Failed to upload payment proof: " + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
        receiptUrl = publicUrl;
      }

      const total = selectedServices.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
      const effectiveDownpaymentPercent = userSelectedDownpaymentPercent !== null ? userSelectedDownpaymentPercent : minimumDownpaymentPercent;
      const downpaymentAmt = total * (effectiveDownpaymentPercent / 100);
      const balanceAmt = total - downpaymentAmt;
      const normalizedPhone = normalizePhilippinePhone(customerPhone);
      if (!normalizedPhone) {
        throw new Error("Enter a valid Philippine mobile number for SMS updates. Example: 09171234567 or +639171234567.");
      }

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

      const itemsPayload = selectedServices.map(item => ({
        id: item.id,
        name: item.name,
        item_type: item.item_type || 'service',
        quantity: item.quantity || 1,
        price: Number(item.price),
        design_url: item.designUrl || null,
        design_version: item.designVersion || null,
        selected_specs: item.selected_specs || null,
      }));

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
          customer_phone: normalizedPhone,
          quotation_valid_until: new Date(Date.now() + 14 * 86400000).toISOString(),
          quotation_terms: "Production starts after customization approval, final proof approval, and required payment confirmation.",
          tax_amount: 0,
          discount_amount: 0,
          downpayment_amount: downpaymentAmt,
          balance_amount: balanceAmt,
        })
        .select()
        .single();

      if (orderError) throw new Error("Order failed: " + orderError.message);

      for (const item of selectedServices) {
        if (item.item_type === 'product') {
          const { data: productData } = await supabase
            .from('services').select('stock_qty').eq('id', item.id).single();
          if (productData) {
            const orderedQty = item.quantity || 1;
            const newStockQty = productData.stock_qty - orderedQty;
            await supabase.from('services')
              .update({ stock_qty: newStockQty })
              .eq('id', item.id);
            await supabase.from('inventory_movements').insert({
              business_id: businessId,
              service_id: item.id,
              qty_change: -orderedQty,
              new_stock_qty: newStockQty,
              reason: 'ORDER_DEDUCTION',
              note: `Order ${order.id}`,
              created_by: userId,
            });
          }
        }
      }

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
      alert("Order placed successfully!");
      router.push(`/track`);

    } catch (error) {
      console.error("Checkout execution error:", error);
      alert(error.message || "Failed to place order. Please try again.");
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
          <h1 className="text-xl font-bold">Print Shop Not Found</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">The shop details could not be loaded.</p>
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cmyk-bar" />
            <div className="p-6 text-center space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <QrCode size={16} className="text-[#EC008C]" /> Payment QR Code
                </h2>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <img src={business.qr_url} alt="Payment QR" className="mx-auto w-44 h-auto rounded-xl border border-slate-200" />
              
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">GCash / Maya / Bank Transfer</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">₱{downpaymentAmount.toFixed(2)} <span className="text-xs font-normal text-slate-500">downpayment</span></p>
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

        <section className="mx-auto max-w-[1600px] px-4 md:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">

            {/* LEFT: CHECKOUT STEPS */}
            <div className="space-y-6">

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
                              Baseline: {s.selected_specs?.size || "Default size"} / {s.selected_specs?.material || "Default material"} / {s.selected_specs?.quality || "Standard quality"}
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
                        {s.selected_specs?.notes && <p className="mt-2 text-[11px] italic text-amber-700">Customization notes: {s.selected_specs.notes}</p>}
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
                    <p className="mt-1 text-[11px] text-slate-500">SMS will be sent when your order is preparing, ready, and completed.</p>
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

                <div className="space-y-3 mb-6">
                  {selectedServices.map((s, idx) => (
                    <div key={s.cart_item_id || `${s.id}-${idx}`} className="flex justify-between items-start text-xs pb-3 border-b border-slate-100 last:border-0">
                      <div className="space-y-0.5 max-w-[70%]">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        <p className="text-slate-500 text-[11px]">Quantity: {s.quantity || 1}</p>
                        
                        {s.selected_specs && (
                          <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 space-y-0.5">
                            {s.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-800">{s.selected_specs.size}</span></div>}
                            {s.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-800">{s.selected_specs.material}</span></div>}
                            {s.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-800">{s.selected_specs.quality}</span></div>}
                            {s.selected_specs.notes && <div className="text-amber-800 italic">"Notes: {s.selected_specs.notes}"</div>}
                          </div>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">₱{(Number(s.price) * (s.quantity || 1)).toFixed(2)}</span>
                    </div>
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
