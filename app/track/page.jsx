"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { 
  Truck, Printer, Clock, 
  MapPin, CheckCircle2, 
  Loader2, AlertTriangle, ShoppingBag,
  Star, Package, CreditCard, Upload, XCircle, Eye, MessageSquare, AlertOctagon, X, RefreshCcw,
  ChevronLeft, ChevronRight
} from "lucide-react";
import ReceiptModal from "@/components/ReceiptModal";
import {
  getUploadExtension,
  PRIVATE_ASSETS_BUCKET,
  optimizeImageForUpload,
  resolveStorageUrl,
  toStorageRef,
} from "@/lib/imageUpload";
import { formatPesoAmount, getOrderPaymentSummary } from "@/lib/paymentSummary";

const ORDERS_PER_PAGE = 5;

// Never request the raw review text from the customer-facing order reader.
// `feedback_masked` is materialized by the protected Supabase trigger.
const CUSTOMER_ORDER_SELECT = `
  id, customer_id, business_id, status, payment_method, total, customer_phone,
  items, receipt_url, cancel_reason, cancelled_at, refund_proof_url,
  refund_receipt_url, refund_reason, refund_requested_at, refunded_at,
  downpayment_amount, balance_amount, fully_paid, design_files,
  quotation_valid_until, quotation_terms, tax_amount, discount_amount,
  created_at, updated_at, delivery_type, delivery_address,
  delivery_coordinates, fulfillment_mode, expected_fulfillment_at,
  delivery_fee, delivery_distance_km, delivery_extra_distance_km,
  delivery_base_fee, delivery_extra_fee, confirmed_payment_amount,
  payment_confirmation_status, payment_confirmed_at, payment_confirmed_by,
  remaining_payment_status, remaining_payment_method, remaining_payment_proof_url,
  remaining_payment_proof_name, remaining_payment_proof_content_type,
  remaining_payment_proof_size_bytes, remaining_payment_note,
  remaining_payment_rejection_reason, remaining_payment_submitted_at,
  remaining_payment_reviewed_at, remaining_payment_reviewed_by,
  rating, feedback_masked, feedback_hidden, feedback_hidden_at,
  feedback_hidden_by, review_service_id,
  businesses ( name, address, phone )
`;

const STATUS_MAP = {
  PENDING:           { label: "Pending Confirmation", color: "border-[#E6C94A] bg-[#FFF9D6] text-[#796900]", accent: "text-[#8A7200]", marker: "bg-[#FFF200]" },
  PLACED:            { label: "Order Placed",          color: "border-[#8DEEEE] bg-[#E7FFFF] text-[#006A6A]", accent: "text-[#007A7A]", marker: "bg-[#00FFFF]" },
  PREPARING:         { label: "In Production",         color: "border-[#EFA3D0] bg-[#FFF0F8] text-[#A90063]", accent: "text-[#EC008C]", marker: "bg-[#EC008C]" },
  READY_TO_PICK_UP:  { label: "Ready for Pickup",      color: "border-[#9BC4F5] bg-[#EEF6FF] text-[#195A9E]", accent: "text-[#195A9E]", marker: "bg-[#9BC4F5]" },
  RIDER_ON_THE_WAY:  { label: "Out for Delivery",      color: "border-[#D5B7FF] bg-[#F5EEFF] text-[#6B35A5]", accent: "text-[#6B35A5]", marker: "bg-[#C7A5FF]" },
  DELIVERY_COMPLETED:{ label: "Delivery Completed",    color: "border-[#B9B8B1] bg-[#ECECE8] text-[#4E4E49]", accent: "text-[#B9B8B1]", marker: "bg-[#B9B8B1]" },
  COMPLETED:         { label: "Order Completed",       color: "border-[#B9B8B1] bg-[#ECECE8] text-[#4E4E49]", accent: "text-[#B9B8B1]", marker: "bg-[#B9B8B1]" },
  CANCELLED:         { label: "Cancelled",             color: "border-[#F2A5A5] bg-[#FFF0F0] text-[#A32828]", accent: "text-[#FF8D8D]", marker: "bg-[#FF8D8D]" },
  REFUND_PENDING:    { label: "Refund Processing",      color: "border-[#F1BF83] bg-[#FFF5E8] text-[#A94800]", accent: "text-[#F1BF83]", marker: "bg-[#F1BF83]" },
  REFUNDED:          { label: "Refunded by Shop",       color: "border-[#8BD9D0] bg-[#E9FBF8] text-[#007A6A]", accent: "text-[#8BD9D0]", marker: "bg-[#8BD9D0]" },
  REFUND_CONFIRMED:  { label: "Refund Confirmed",       color: "border-[#AEB9F2] bg-[#EEF0FF] text-[#38449C]", accent: "text-[#AEB9F2]", marker: "bg-[#AEB9F2]" },
};

const getProgressSteps = (order) => [
  { key: "PENDING", label: "Pending" },
  { key: "PLACED", label: "Order placed" },
  { key: "PREPARING", label: "In production" },
  order.delivery_type === "DELIVERY"
    ? { key: "RIDER_ON_THE_WAY", label: "Out for delivery" }
    : { key: "READY_TO_PICK_UP", label: "Ready for pickup" },
  order.delivery_type === "DELIVERY"
    ? { key: "DELIVERY_COMPLETED", label: "Delivery completed" }
    : { key: "COMPLETED", label: "Completed" },
];

export default function TrackOrderPage() {
  const router = useRouter();
  const [reviewOrderId, setReviewOrderId] = useState("");
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [reviewsState, setReviewsState] = useState({});
  const [submittingReviewId, setSubmittingReviewId] = useState(null);
  const [confirmingRefundId, setConfirmingRefundId] = useState(null);
  const [reportingRefundId, setReportingRefundId] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [requestingRefundId, setRequestingRefundId] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [viewRefundProof, setViewRefundProof] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [remainingPaymentModal, setRemainingPaymentModal] = useState(null);
  const [remainingPaymentFile, setRemainingPaymentFile] = useState(null);
  const [remainingPaymentNote, setRemainingPaymentNote] = useState("");
  const [remainingPaymentError, setRemainingPaymentError] = useState("");
  const [submittingRemainingPayment, setSubmittingRemainingPayment] = useState(false);

  const totalPages = Math.ceil(orders.length / ORDERS_PER_PAGE);
  const pageStart = (currentPage - 1) * ORDERS_PER_PAGE;
  const visibleOrders = orders.slice(pageStart, pageStart + ORDERS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(totalPages, 1)));
  }, [totalPages]);

  useEffect(() => {
    setReviewOrderId(new URLSearchParams(window.location.search).get("review") || "");
  }, []);

  useEffect(() => {
    if (!reviewOrderId || !orders.length) return;
    const orderIndex = orders.findIndex((order) => order.id === reviewOrderId);
    if (orderIndex < 0) return;
    setCurrentPage(Math.floor(orderIndex / ORDERS_PER_PAGE) + 1);
  }, [reviewOrderId, orders]);

  useEffect(() => {
    if (!reviewOrderId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const reviewElement = document.getElementById(`review-${reviewOrderId}`);
      if (!reviewElement) return;
      reviewElement.scrollIntoView({ behavior: "smooth", block: "center" });
      reviewElement.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reviewOrderId, currentPage, orders.length]);

  useEffect(() => {
    let isActive = true;
    let subscription;

    async function loadUserAndOrders() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!isActive) return;
        setUser(authUser);

        if (!authUser) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();

        const customer = profile?.role === "CUSTOMER";
        setIsCustomer(customer);

        if (!customer) return;

        const fetchOrders = async () => {
          const { data, error } = await supabase
            .from("orders")
            .select(CUSTOMER_ORDER_SELECT)
            .eq("customer_id", authUser.id)
            .order("created_at", { ascending: false });

          if (!isActive) return;
          if (error) {
            console.error("[Track] Failed to load orders:", error.message);
            setOrders([]);
            setReviewsState({});
            return;
          }

          const rows = data || [];
          setOrders(rows);
          const initReviews = {};
          rows.forEach((o) => {
            const reviewItems = Array.isArray(o.items) ? o.items.filter((item) => item?.id && item?.name) : [];
            initReviews[o.id] = {
              rating: o.rating || 0,
              feedback: o.feedback_masked || "",
              review_service_id: o.review_service_id || (reviewItems.length === 1 ? reviewItems[0].id : ""),
            };
          });
          setReviewsState(initReviews);
        };

        await fetchOrders();

        const channelName = `customer_orders_status_${authUser.id}_${Date.now()}`;
        subscription = supabase
          .channel(channelName)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${authUser.id}` }, () => {
            fetchOrders();
          })
          .subscribe();
      } catch (err) {
        console.error("[Track] Failed to initialize order tracking:", err);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadUserAndOrders();

    return () => {
      isActive = false;
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const openRemainingPaymentModal = (order, method) => {
    setRemainingPaymentModal({ order, method });
    setRemainingPaymentFile(null);
    setRemainingPaymentNote("");
    setRemainingPaymentError("");
  };

  const handleSubmitRemainingPayment = async () => {
    if (!remainingPaymentModal || submittingRemainingPayment) return;
    const { order, method } = remainingPaymentModal;
    if (method === "E-Wallet") {
      if (!remainingPaymentFile) {
        setRemainingPaymentError("Choose your payment proof first.");
        return;
      }
      if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(remainingPaymentFile.type)) {
        setRemainingPaymentError("Use a PNG, JPG, WebP, or PDF file.");
        return;
      }
      if (!remainingPaymentFile.size || remainingPaymentFile.size > 5 * 1024 * 1024) {
        setRemainingPaymentError("Payment proof must be between 1 byte and 5 MB.");
        return;
      }
    }

    setSubmittingRemainingPayment(true);
    setRemainingPaymentError("");
    let uploadedPaymentPath = null;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error("Your customer session has expired. Please sign in again.");

      const headers = { Authorization: `Bearer ${sessionData.session.access_token}` };
      let body;
      if (method === "E-Wallet") {
        // Upload the proof directly from the browser to Supabase Storage so
        // the file never consumes a Vercel/serverless request body.
        const optimizedProof = await optimizeImageForUpload(remainingPaymentFile);
        const extension = getUploadExtension(optimizedProof);
        const uploadId = globalThis.crypto?.randomUUID?.()
          || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadedPaymentPath = `payments/${sessionData.session.user.id}/${order.id}/${uploadId}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(PRIVATE_ASSETS_BUCKET)
          .upload(uploadedPaymentPath, optimizedProof, {
            cacheControl: "3600",
            contentType: optimizedProof.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;

        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          orderId: order.id,
          method,
          note: remainingPaymentNote.trim(),
          proofStoragePath: toStorageRef(PRIVATE_ASSETS_BUCKET, uploadedPaymentPath),
          proofFileName: remainingPaymentFile.name,
          proofContentType: optimizedProof.type,
          proofSizeBytes: optimizedProof.size,
        });
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ orderId: order.id, method, note: remainingPaymentNote.trim() });
      }

      const response = await fetch("/api/orders/payment-proof", { method: "POST", headers, body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "We could not submit the remaining payment.");
      if (!payload.order?.id) throw new Error("The server did not return the updated payment state.");

      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, ...payload.order } : item));
      setRemainingPaymentModal(null);
      setRemainingPaymentFile(null);
      setRemainingPaymentNote("");
      alert(payload.notificationWarning
        ? `Payment submitted. ${payload.notificationWarning}`
        : method === "E-Wallet"
          ? "Payment proof submitted. The shop owner will review it before confirming your balance."
          : "The shop owner was notified that you paid in cash. Your balance remains pending until the shop confirms receipt.");
    } catch (error) {
      setRemainingPaymentError(error.message || "We could not submit the remaining payment.");
      if (uploadedPaymentPath) {
        await supabase.storage.from(PRIVATE_ASSETS_BUCKET).remove([uploadedPaymentPath]);
      }
    } finally {
      setSubmittingRemainingPayment(false);
    }
  };

  const handleConfirmRefund = async (orderId) => {
    setConfirmingRefundId(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "REFUND_CONFIRMED" })
        .eq("id", orderId)
        .eq("customer_id", user?.id)
        .eq("status", "REFUNDED");
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "REFUND_CONFIRMED" } : o));
    } catch (err) {
      alert(err.message || "Failed to confirm refund.");
    } finally {
      setConfirmingRefundId(null);
    }
  };

  const handleReportNonRefund = async (orderId) => {
    setReportingRefundId(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "REFUND_PENDING" })
        .eq("id", orderId)
        .eq("customer_id", user?.id)
        .eq("status", "CANCELLED");
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "REFUND_PENDING" } : o));
      alert("Report submitted to shop owner.");
    } catch (err) {
      alert(err.message || "Failed to report issue.");
    } finally {
      setReportingRefundId(null);
    }
  };

  const handleCustomerCancel = async (order) => {
    if (!order || order.status !== "PENDING" || cancellingOrderId) return;
    if (!window.confirm("Cancel this pending order? If you already paid, the shop will review any refund due.")) return;

    setCancellingOrderId(order.id);
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          cancel_reason: "Cancelled by customer",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("customer_id", user?.id)
        .eq("status", "PENDING")
        .select("id, status, cancel_reason, cancelled_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This order is no longer pending and could not be cancelled.");
      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, ...data } : item));
      alert("Your pending order was cancelled.");
    } catch (error) {
      alert(error.message || "We could not cancel this order.");
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleCustomerRefundRequest = async (order) => {
    if (!order || !["PENDING", "PLACED"].includes(order.status) || requestingRefundId) return;
    if (!window.confirm("Request a refund for this order? The shop owner must review and process the refund.")) return;

    setRequestingRefundId(order.id);
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: "REFUND_PENDING",
          refund_reason: "Refund requested by customer",
          refund_requested_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("customer_id", user?.id)
        .in("status", ["PENDING", "PLACED"])
        .select("id, status, refund_reason, refund_requested_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This order is no longer eligible for a refund request.");
      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, ...data } : item));
      alert("Your refund request was sent to the shop owner for review.");
    } catch (error) {
      alert(error.message || "We could not submit the refund request.");
    } finally {
      setRequestingRefundId(null);
    }
  };

  const handleReviewSubmit = async (orderId) => {
    const rev = reviewsState[orderId];
    if (!rev || !rev.rating) return alert("Please select a star rating.");
    const targetOrder = orders.find(o => o.id === orderId);
    const reviewItems = Array.isArray(targetOrder?.items) ? targetOrder.items.filter((item) => item?.id && item?.name) : [];
    if (reviewItems.length > 1 && !rev.review_service_id) return alert("Please choose which service or product you are reviewing.");
    if (!["COMPLETED", "DELIVERY_COMPLETED"].includes(targetOrder?.status)) {
      return alert("Feedback and rating can only be submitted after delivery or pickup is completed.");
    }
    setSubmittingReviewId(orderId);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: savedReview, error } = await supabase
        .from("orders")
        .update({ rating: rev.rating, feedback: rev.feedback, review_service_id: rev.review_service_id || null })
        .eq("id", orderId)
        .eq("customer_id", user?.id)
        .in("status", ["COMPLETED", "DELIVERY_COMPLETED"])
        .select("feedback_masked, review_service_id")
        .single();

      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        rating: rev.rating,
        feedback: savedReview?.feedback_masked || "",
        feedback_masked: savedReview?.feedback_masked || "",
        review_service_id: savedReview?.review_service_id || rev.review_service_id || null,
      } : o));
      alert("Thank you! Your review has been published.");
    } catch (err) {
      alert(err.message || "Failed to submit review.");
    } finally {
      setSubmittingReviewId(null);
    }
  };

  if (loading) {
    return (
      <main className="track-page flex min-h-screen items-center justify-center bg-[#F6F6F2] font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading your orders...</p>
        </div>
      </main>
    );
  }

  if (!user || !isCustomer) {
    return (
      <main className="track-page flex min-h-screen items-center justify-center bg-[#1A1A1A] p-6 font-sans text-slate-900">
        <div className="max-w-sm rounded-3xl border border-[#D8D6CE] bg-white p-10 text-center shadow-[0_18px_42px_rgba(26,26,26,0.16)]">
          <ShoppingBag size={40} className="mx-auto mb-3 text-[#EC008C]" />
          <h1 className="text-xl font-black tracking-tight">Customer portal only</h1>
          <p className="mt-1 mb-6 text-xs text-slate-500">Please sign in with a customer account to view your order history.</p>
          <button onClick={() => router.push('/login')} className="w-full rounded-xl bg-[#1A1A1A] py-3 font-extrabold text-xs text-white transition-colors hover:bg-[#EC008C]">
            Sign In Now
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* RECEIPT MODAL */}
      {viewReceipt && (
        <ReceiptModal order={viewReceipt} onClose={() => setViewReceipt(null)} isOwner={false} initialDocType={viewDocType} />
      )}

      {/* REFUND PROOF MODAL */}
      {viewRefundProof && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setViewRefundProof(null)}>
          <div className="dialog-surface max-w-md w-full overflow-hidden p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900">Refund Payment Proof</h3>
              <button onClick={() => setViewRefundProof(null)} className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            <img src={viewRefundProof} alt="Refund Proof" className="w-full h-auto border border-slate-200 max-h-[60vh] object-contain" />
          </div>
        </div>
      )}

      {remainingPaymentModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="remaining-payment-title" onClick={() => !submittingRemainingPayment && setRemainingPaymentModal(null)}>
          <div className="dialog-surface w-full max-w-lg space-y-5 p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Remaining balance</p>
                <h2 id="remaining-payment-title" className="mt-1 text-lg font-black tracking-tight text-slate-950">
                  {remainingPaymentModal.method === "E-Wallet" ? "Upload payment proof" : "Confirm offline payment"}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">The shop must confirm this payment before it can complete the order.</p>
              </div>
              <button type="button" onClick={() => setRemainingPaymentModal(null)} disabled={submittingRemainingPayment} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40" aria-label="Close remaining payment dialog"><X size={18} /></button>
            </div>

            <div className="rounded-xl border border-[#00AFC0]/30 bg-[#EFFFFF] p-4 text-xs">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-600">Order</span><strong className="text-slate-950">#{String(remainingPaymentModal.order.id).split("-")[0].toUpperCase()}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-slate-600">Remaining balance</span><strong className="text-[#EC008C]">{formatPesoAmount(getOrderPaymentSummary(remainingPaymentModal.order).balance)}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-slate-600">Method</span><strong className="text-slate-950">{remainingPaymentModal.method}</strong></div>
            </div>

            {remainingPaymentModal.method === "E-Wallet" ? (
              <div>
                <label htmlFor="remaining-payment-proof" className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Payment proof</label>
                <input id="remaining-payment-proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setRemainingPaymentFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-dashed border-[#00AFC0] bg-[#F7FFFF] p-3 text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#1A1A1A] file:px-3 file:py-2 file:text-xs file:font-black file:text-white" />
                <p className="mt-2 text-[11px] text-slate-500">PNG, JPG, WebP, or PDF · maximum 5 MB</p>
                {remainingPaymentFile && <p className="mt-1 break-all text-[11px] font-bold text-slate-700">Selected: {remainingPaymentFile.name}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-[#FFF200] bg-[#FFFBE0] p-4 text-xs leading-relaxed text-slate-700">
                Tap the button only after paying the full remaining balance in cash. This notifies the shop owner; it does not mark the order paid until the shop confirms receipt.
              </div>
            )}

            <div>
              <label htmlFor="remaining-payment-note" className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Note (optional)</label>
              <textarea id="remaining-payment-note" value={remainingPaymentNote} onChange={(event) => setRemainingPaymentNote(event.target.value)} maxLength={500} rows={3} placeholder="Add a short note for the shop owner" className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none focus:border-[#00AFC0] focus:ring-2 focus:ring-[#00AFC0]/20" />
            </div>

            {remainingPaymentError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{remainingPaymentError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setRemainingPaymentModal(null)} disabled={submittingRemainingPayment} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleSubmitRemainingPayment} disabled={submittingRemainingPayment} className="flex-1 rounded-xl bg-[#1A1A1A] px-4 py-3 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:cursor-wait disabled:opacity-60">{submittingRemainingPayment ? "Submitting..." : remainingPaymentModal.method === "E-Wallet" ? "Submit payment proof" : "Notify shop I already paid"}</button>
            </div>
          </div>
        </div>
      )}

      <main className="track-page min-h-screen bg-[#F6F6F2] pb-20 font-sans text-[#1A1A1A]">

        {/* Header */}
        <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-9 text-white sm:px-8 sm:pb-12 sm:pt-11 lg:px-12">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 border border-white/10" />
          <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Track your <span className="text-[#00FFFF]">orders.</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">Follow every print job, view your receipts, and stay updated from order placement to pickup or delivery.</p>
            </div>
          </div>
        </section>

        {/* Orders List */}
        <section data-tour="track-orders" className="mx-auto max-w-6xl px-4 pt-8 sm:px-8 lg:px-12">
          <div className="mb-5 flex flex-wrap items-end justify-end gap-4 border-b border-[#D8D6CE] pb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#676762]">
              <ShoppingBag size={14} className="text-[#EC008C]" />
              {orders.length} {orders.length === 1 ? "order" : "orders"}
            </div>
          </div>
          {orders.length === 0 ? (
            <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-[#D8D6CE] bg-white p-12 text-center">
              <ShoppingBag size={48} className="mx-auto text-[#EC008C]" />
              <h2 className="text-lg font-black tracking-tight text-slate-900">No orders yet</h2>
              <p className="text-xs text-slate-500">You haven't placed any print orders yet. Browse our print shop directory to get started!</p>
              <button onClick={() => router.push('/browse')} className="rounded-xl bg-[#1A1A1A] px-5 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-[#EC008C]">
                Find Print Shops
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {visibleOrders.map((o) => {
                const statusInfo = STATUS_MAP[o.status] || {
                  label: o.status,
                  color: "border-[#D8D6CE] bg-[#ECECE8] text-[#676762]",
                  accent: "text-[#B9B8B1]",
                  marker: "bg-[#B9B8B1]",
                };
                const bInfo = o.businesses || {};
                const isReviewable = ["COMPLETED", "DELIVERY_COMPLETED"].includes(o.status);
                const isRefundPending = o.status === "REFUND_PENDING";
                const isRefunded = o.status === "REFUNDED";
                const canCustomerCancel = o.status === "PENDING";
                const canCustomerRequestRefund = ["PENDING", "PLACED"].includes(o.status);
                const remainingPaymentMethod = o.payment_method === "E-Wallet" ? "E-Wallet" : "COD";
                const isEWalletRemainingPayment = remainingPaymentMethod === "E-Wallet";
                const progressSteps = getProgressSteps(o);
                const payment = getOrderPaymentSummary(o);
                const currentProgressIndex = o.delivery_type === "DELIVERY" && o.status === "COMPLETED"
                  ? progressSteps.length - 1
                  : progressSteps.findIndex((step) => step.key === o.status);
                const isTerminalStatus = ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED"].includes(o.status);

                return (
                  <div key={o.id} className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm">
                    <div className="cmyk-bar-sm" />

                    <div className="p-6 sm:p-8 space-y-6">
                      {/* Status overview: intentionally the first and most prominent element. */}
                      <div className={`relative overflow-hidden rounded-2xl border-l-8 px-5 py-6 sm:px-7 sm:py-7 ${statusInfo.color}`}>
                        <div className={`absolute left-0 top-0 h-full w-2 ${statusInfo.marker}`} />
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${statusInfo.accent}`}>Current order status</p>
                            <h2 className="mt-2 text-3xl font-black uppercase leading-[0.95] tracking-tight text-[#1A1A1A] sm:text-4xl">{statusInfo.label}<span className={statusInfo.accent}>.</span></h2>
                          </div>
                          <span className="inline-flex w-fit rounded-lg border border-current bg-white/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em]">
                            {o.delivery_type === "DELIVERY" ? "Delivery order" : "Pickup order"}
                          </span>
                        </div>

                        {!isTerminalStatus && (
                          <div className="mt-5 grid grid-cols-5 gap-1 sm:gap-2">
                            {progressSteps.map((step, index) => {
                              const reached = index <= currentProgressIndex;
                              return (
                                <div key={step.key} className="min-w-0">
                                  <div className="flex items-center">
                                    <span className={`h-3 w-3 shrink-0 border ${reached ? `${statusInfo.marker} border-[#1A1A1A]/20` : "border-[#676762] bg-white/40"}`} />
                                    {index < progressSteps.length - 1 && (
                                      <span className={`h-px w-full ${index < currentProgressIndex ? statusInfo.marker : "bg-[#676762]/35"}`} />
                                    )}
                                  </div>
                                  <span className={`mt-2 block truncate text-[9px] font-bold leading-tight sm:text-[10px] ${reached ? "text-[#1A1A1A]" : "text-[#676762]"}`}>
                                    {step.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                        <div>
                          <div className="mb-1 font-bold text-base text-slate-900">{bInfo.name || "Print Shop"}</div>
                          <p className="text-xs text-slate-500">Order ID: <strong className="text-slate-800 font-mono">{o.id.split('-')[0].toUpperCase()}</strong> • Placed on {new Date(o.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!canCustomerCancel && (
                            <button
                              onClick={() => { setViewDocType("RECEIPT"); setViewReceipt(o); }}
                              className="inline-flex items-center rounded-xl border border-[#D8D6CE] bg-[#ECECE8] px-3.5 py-2 text-xs font-bold text-[#1A1A1A] transition-colors hover:bg-[#D8D6CE]"
                            >
                              Receipt
                            </button>
                          )}
                          <button
                            onClick={() => { setViewDocType("QUOTATION"); setViewReceipt(o); }}
                            className="inline-flex items-center rounded-xl border border-[#E6D400] bg-[#FFF9D6] px-3.5 py-2 text-xs font-bold text-[#796900] transition-colors hover:bg-[#FFF200]"
                          >
                            Quotation
                          </button>
                          <Link
                            href={`/messages?business=${o.business_id}`}
                            className="inline-flex items-center rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-[#EC008C]"
                          >
                            Chat Shop
                          </Link>
                        </div>
                      </div>

                      {/* Items & Pricing */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        <div className="md:col-span-2 space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Order Items</p>
                          <div className="space-y-2">
                            {(o.items || []).map((it, idx) => (
                              <div key={idx} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900">{it.name}</span>
                                    <span className="text-slate-400 text-[11px]">×{it.quantity || 1}</span>
                                  </div>
                                  {it.selected_specs && (
                                    <div className="text-[11px] text-slate-600 mt-1 space-y-0.5 font-medium">
                                      {it.selected_specs.size && <div>Size: <span className="font-semibold text-slate-900">{it.selected_specs.size}</span></div>}
                                      {it.selected_specs.size_breakdown?.length > 0 && <div>Sizes: <span className="font-semibold text-slate-900">{it.selected_specs.size_breakdown.map((row) => `${row.size} × ${row.quantity}`).join(", ")}</span></div>}
                                      {it.selected_specs.material && <div>Paper/Material: <span className="font-semibold text-slate-900">{it.selected_specs.material}</span></div>}
                                      {it.selected_specs.quality && <div>Quality: <span className="font-semibold text-slate-900">{it.selected_specs.quality}</span></div>}
                                      {it.selected_specs.notes && <div className="text-amber-800 italic">"Notes: {it.selected_specs.notes}"</div>}
                                    </div>
                                  )}
                                </div>
                                <span className="font-bold text-slate-900 shrink-0">₱{(Number(it.price) * (it.quantity || 1)).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Summary breakdown */}
                        <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs">
                          <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">Payment Details</p>
                          <div className="flex justify-between text-slate-600">
                            <span>Total Amount:</span>
                            <span className="font-bold text-slate-900">{formatPesoAmount(payment.total)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Downpayment Paid:</span>
                            <span className="font-bold text-emerald-600">{formatPesoAmount(payment.downpayment)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Confirmed Paid:</span>
                            <span className="font-bold text-emerald-600">{formatPesoAmount(payment.confirmedAmount)}</span>
                          </div>
                          {o.delivery_type === "DELIVERY" && (
                            <div className="flex justify-between text-slate-600">
                              <span>Delivery Fee:</span>
                              <span className="font-bold text-[#009FA0]">{formatPesoAmount(o.delivery_fee)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                            <span>Remaining Balance:</span>
                            <span className={`font-bold ${payment.balance > 0 ? "text-[#EC008C]" : "text-emerald-600"}`}>{formatPesoAmount(payment.balance)}</span>
                          </div>
                          <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-600">
                            <span>Payment status:</span>
                            <span className={`text-right font-bold ${payment.isPaymentConfirmed ? "text-emerald-600" : payment.paymentProofPresent ? "text-amber-700" : "text-[#EC008C]"}`}>{payment.statusLabel}{payment.isPaymentConfirmed ? " · Paid in full" : ""}</span>
                          </div>
                          <p className="border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
                            {payment.isPaymentConfirmed
                              ? "Your payment has been confirmed by the shop."
                              : payment.status === "PROOF_AWAITING_CONFIRMATION"
                                ? "Your payment proof is awaiting confirmation from the shop."
                                : payment.balance > 0
                                  ? "The remaining balance must be paid and confirmed before the shop can complete this order."
                                  : "Payment is waiting for confirmation from the shop."}
                          </p>
                        </div>

                      </div>

                      {payment.balance > 0 && !isTerminalStatus && !payment.isPaymentConfirmed && payment.downpayment <= payment.confirmedAmount + 0.009 ? (
                        <section className={`space-y-3 rounded-2xl border p-4 ${payment.remainingPaymentRejected ? "border-rose-200 bg-rose-50" : payment.remainingPaymentPending ? "border-amber-200 bg-amber-50" : "border-[#00AFC0]/30 bg-[#EFFFFF]"}`} aria-label="Remaining payment">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900"><CreditCard size={15} className="text-[#EC008C]" /> Remaining payment</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                {payment.remainingPaymentPending
                                  ? "Your payment was submitted and is waiting for the shop owner to review it."
                                  : payment.remainingPaymentRejected
                                    ? `The shop asked you to resubmit this payment${o.remaining_payment_rejection_reason ? `: ${o.remaining_payment_rejection_reason}` : "."}`
                                    : isEWalletRemainingPayment
                                      ? `Pay the remaining balance of ${formatPesoAmount(payment.balance)} by e-wallet, then upload your payment proof. The shop must confirm it before completing the order.`
                                      : `Pay the remaining balance of ${formatPesoAmount(payment.balance)} in cash on pickup or delivery, then notify the shop. The shop must confirm receipt before completing the order.`}
                              </p>
                            </div>
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${payment.remainingPaymentPending ? "border-amber-300 bg-white text-amber-800" : payment.remainingPaymentRejected ? "border-rose-300 bg-white text-rose-700" : "border-[#00AFC0]/40 bg-white text-[#007C82]"}`}>
                              {payment.remainingPaymentPending ? payment.remainingPaymentStatus === "SUBMITTED" ? "Submitted" : "Under review" : payment.remainingPaymentRejected ? "Resubmission needed" : isEWalletRemainingPayment ? "E-Wallet" : "Cash"}
                            </span>
                          </div>
                          {!payment.remainingPaymentPending && (
                            <div className="flex flex-wrap gap-2">
                              {isEWalletRemainingPayment ? (
                                <button type="button" onClick={() => openRemainingPaymentModal(o, remainingPaymentMethod)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]"><Upload size={14} /> {payment.remainingPaymentRejected ? "Resubmit payment proof" : "Upload payment proof"}</button>
                              ) : (
                                <button type="button" onClick={() => openRemainingPaymentModal(o, remainingPaymentMethod)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#E6C94A] bg-[#FFFBE0] px-4 py-2.5 text-xs font-black text-[#665F00] transition-colors hover:bg-[#FFF200] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C94A]"><CheckCircle2 size={14} /> Notify shop I already paid</button>
                              )}
                            </div>
                          )}
                        </section>
                      ) : payment.balance > 0 && !isTerminalStatus && !payment.isPaymentConfirmed ? (
                        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Initial payment status">
                          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900"><CreditCard size={15} className="text-amber-700" /> Initial payment awaiting confirmation</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">The shop must confirm your initial downpayment before you can submit the remaining balance.</p>
                        </section>
                      ) : null}

                      {/* Actions Banner */}
                      {(canCustomerCancel || canCustomerRequestRefund) && (
                        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Order cancellation and refund actions">
                          <div>
                            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-950"><AlertTriangle size={15} className="text-amber-700" /> Order changes</p>
                            <p className="mt-1 text-xs leading-relaxed text-amber-900">
                              {canCustomerCancel
                                ? "This order is still Pending. You can cancel it or request a refund for shop review."
                                : "This order is already Placed, so it cannot be cancelled. You can still request a refund for shop review."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {canCustomerCancel && (
                              <button type="button" onClick={() => handleCustomerCancel(o)} disabled={cancellingOrderId === o.id || requestingRefundId === o.id} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-black text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">
                                <XCircle size={14} /> {cancellingOrderId === o.id ? "Cancelling..." : "Cancel order"}
                              </button>
                            )}
                            {canCustomerRequestRefund && (
                              <button type="button" onClick={() => handleCustomerRefundRequest(o)} disabled={cancellingOrderId === o.id || requestingRefundId === o.id} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#EC008C] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#c90076] disabled:cursor-wait disabled:opacity-60">
                                <RefreshCcw size={14} /> {requestingRefundId === o.id ? "Submitting..." : "Request refund"}
                              </button>
                            )}
                          </div>
                        </section>
                      )}

                      {isRefundPending && (
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                          <div className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-semibold text-orange-800 sm:w-auto">
                            Refund is being processed by the shop.
                          </div>
                        </div>
                      )}

                      {/* Refund Confirmation Banner */}
                      {isRefunded && (
                        <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                          <p className="text-xs text-teal-900 font-medium">The print shop has processed a refund for this order. Please check your e-wallet / account balance.</p>
                          <div className="flex gap-2">
                            {o.refund_proof_url && (
                              <button onClick={async () => {
                                const url = await resolveStorageUrl(o.refund_proof_url);
                                if (url) setViewRefundProof(url);
                                else alert("This refund proof is unavailable or access was denied.");
                              }} className="rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800">
                                View Refund Proof
                              </button>
                            )}
                            <button onClick={() => handleConfirmRefund(o.id)} disabled={confirmingRefundId === o.id} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">
                              Confirm Refund Received
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Review Submission for Completed Orders */}
                      {isReviewable && (
                        <div id={`review-${o.id}`} tabIndex="-1" className="space-y-3 rounded-2xl border-t border-slate-100 bg-slate-50/50 p-4 pt-4 outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]">
                          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" role="status">
                            Thank you. We appreciate your support. Your order has been completed.
                          </p>
                          <p className="text-xs font-bold text-slate-900">Review the service or products from {bInfo.name}</p>
                          {Array.isArray(o.items) && o.items.filter((item) => item?.id && item?.name).length > 1 && (
                            <label className="block text-xs font-semibold text-slate-700">
                              Which service or product are you reviewing?
                              <select
                                value={reviewsState[o.id]?.review_service_id || ""}
                                onChange={(event) => setReviewsState((prev) => ({ ...prev, [o.id]: { ...prev[o.id], review_service_id: event.target.value } }))}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:ring-2 focus:ring-[#EC008C]"
                              >
                                <option value="">Choose an item</option>
                                {o.items.filter((item) => item?.id && item?.name).map((item) => <option key={item.id} value={item.id}>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</option>)}
                              </select>
                            </label>
                          )}
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewsState(prev => ({ ...prev, [o.id]: { ...prev[o.id], rating: star } }))}
                              >
                                <Star
                                  size={18}
                                  className={(reviewsState[o.id]?.rating || 0) >= star ? "fill-amber-400 text-amber-400" : "text-slate-300"}
                                />
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={reviewsState[o.id]?.feedback || ""}
                            onChange={(e) => setReviewsState(prev => ({ ...prev, [o.id]: { ...prev[o.id], feedback: e.target.value } }))}
                            placeholder="Share your experience with print quality, turnaround time, or service..."
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:ring-2 focus:ring-[#EC008C]"
                          />
                          <button
                            onClick={() => handleReviewSubmit(o.id)}
                            disabled={submittingReviewId === o.id}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#EC008C]"
                          >
                            Submit Review
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orders.length > 0 && totalPages > 1 && (
            <nav className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#D8D6CE] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Order pagination">
              <p className="text-xs font-semibold text-[#676762]">
                Showing {pageStart + 1}–{Math.min(pageStart + ORDERS_PER_PAGE, orders.length)} of {orders.length} orders
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#D8D6CE] bg-[#F6F6F2] px-3 py-2 text-xs font-bold text-[#1A1A1A] transition-colors hover:border-[#00FFFF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                <div className="flex items-center gap-1" aria-label="Pages">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      aria-current={currentPage === page ? "page" : undefined}
                      className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-black transition-colors ${
                        currentPage === page
                          ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                          : "border-[#D8D6CE] bg-white text-[#676762] hover:border-[#EC008C] hover:text-[#EC008C]"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#D8D6CE] bg-[#F6F6F2] px-3 py-2 text-xs font-bold text-[#1A1A1A] transition-colors hover:border-[#00FFFF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </nav>
          )}
        </section>

      </main>
    </>
  );
}
