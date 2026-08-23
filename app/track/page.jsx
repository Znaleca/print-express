"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { 
  Truck, Printer, Clock, 
  MapPin, CheckCircle2, 
  Loader2, AlertTriangle, FileText, ShoppingBag,
  Star, Package, XCircle, RefreshCcw, Eye, MessageSquare, AlertOctagon, X,
  ChevronLeft, ChevronRight
} from "lucide-react";
import ReceiptModal from "@/components/ReceiptModal";
import { resolveStorageUrl } from "@/lib/imageUpload";

const ORDERS_PER_PAGE = 5;

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
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [reviewsState, setReviewsState] = useState({});
  const [submittingReviewId, setSubmittingReviewId] = useState(null);
  const [confirmingRefundId, setConfirmingRefundId] = useState(null);
  const [reportingRefundId, setReportingRefundId] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [refundRequestModal, setRefundRequestModal] = useState(null);
  const [refundReason, setRefundReason] = useState("");
  const [requestingRefund, setRequestingRefund] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [viewRefundProof, setViewRefundProof] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(orders.length / ORDERS_PER_PAGE);
  const pageStart = (currentPage - 1) * ORDERS_PER_PAGE;
  const visibleOrders = orders.slice(pageStart, pageStart + ORDERS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(totalPages, 1)));
  }, [totalPages]);

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
            .select(`
              *,
              businesses ( name, address, phone )
            `)
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
            initReviews[o.id] = {
              rating: o.rating || 0,
              feedback: o.feedback || "",
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

  const handleCancelOrder = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          cancel_reason: cancelReason || "Cancelled by customer",
          cancelled_at: new Date().toISOString()
        })
        .eq("id", cancelModal.orderId)
        .eq("customer_id", user?.id)
        .in("status", ["PENDING", "PLACED", "PREPARING"]);

      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: "CANCELLED", cancel_reason: cancelReason || "Cancelled by customer" } : o));
      setCancelModal(null);
      setCancelReason("");
    } catch (err) {
      alert(err.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

  const handleRequestRefund = async () => {
    if (!refundRequestModal) return;
    setRequestingRefund(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "REFUND_PENDING",
          refund_reason: refundReason || "Customer requested a refund after cancellation",
          refund_requested_at: new Date().toISOString(),
        })
        .eq("id", refundRequestModal.orderId)
        .eq("customer_id", user?.id);

      if (error) throw error;

      setOrders((prev) => prev.map((o) => (
        o.id === refundRequestModal.orderId
          ? { ...o, status: "REFUND_PENDING", refund_reason: refundReason || "Customer requested a refund after cancellation" }
          : o
      )));
      setRefundRequestModal(null);
      setRefundReason("");
    } catch (err) {
      alert(err.message || "Failed to request refund.");
    } finally {
      setRequestingRefund(false);
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

  const handleReviewSubmit = async (orderId) => {
    const rev = reviewsState[orderId];
    if (!rev || !rev.rating) return alert("Please select a star rating.");
    const targetOrder = orders.find(o => o.id === orderId);
    if (!["COMPLETED", "DELIVERY_COMPLETED"].includes(targetOrder?.status)) {
      return alert("Feedback and rating can only be submitted after delivery or pickup is completed.");
    }
    setSubmittingReviewId(orderId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || "Customer";

      const { error } = await supabase
        .from("orders")
        .update({ rating: rev.rating, feedback: rev.feedback })
        .eq("id", orderId)
        .eq("customer_id", user?.id)
        .in("status", ["COMPLETED", "DELIVERY_COMPLETED"]);

      if (error) throw error;

      if (targetOrder && targetOrder.business_id) {
        await supabase
          .from("business_reviews")
          .upsert({
            order_id: orderId,
            business_id: targetOrder.business_id,
            customer_id: user?.id,
            customer_name: customerName,
            rating: rev.rating,
            feedback: rev.feedback,
            created_at: new Date().toISOString(),
          }, { onConflict: "order_id" });
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, rating: rev.rating, feedback: rev.feedback } : o));
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

      {/* CANCEL MODAL */}
      {cancelModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setCancelModal(null)}>
          <div className="dialog-surface max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">Request Order Cancellation</h3>
            <p className="text-xs text-slate-500">Please select or type a reason for cancelling this print order:</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Changed specs, ordered wrong item..."
              className="h-24 w-full border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:ring-2 focus:ring-rose-400"
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCancelModal(null)} className="flex-1 bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                Back
              </button>
              <button onClick={handleCancelOrder} disabled={cancelling} className="flex-1 bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700">
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFUND REQUEST MODAL */}
      {refundRequestModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setRefundRequestModal(null)}>
          <div className="dialog-surface w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-bold text-base text-slate-900">Request a refund</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Tell the print shop why you are requesting a refund. The shop will review it and upload proof when the refund is sent.</p>
            </div>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. I paid a downpayment but the order was cancelled..."
              className="h-24 w-full border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:ring-2 focus:ring-[#EC008C]"
            />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setRefundRequestModal(null)} className="flex-1 bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                Back
              </button>
              <button type="button" onClick={handleRequestRefund} disabled={requestingRefund} className="flex-1 bg-[#EC008C] py-2.5 text-xs font-bold text-white hover:bg-[#c90076] disabled:opacity-60">
                {requestingRefund ? "Submitting..." : "Submit refund request"}
              </button>
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
        <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-8 lg:px-12">
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
                const canCancel = o.status === "PLACED" || o.status === "PENDING";
                const isReviewable = ["COMPLETED", "DELIVERY_COMPLETED"].includes(o.status);
                const isRefundPending = o.status === "REFUND_PENDING";
                const isRefunded = o.status === "REFUNDED";
                const canRequestRefund = o.status === "CANCELLED";
                const progressSteps = getProgressSteps(o);
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
                          <button
                            onClick={() => { setViewDocType("RECEIPT"); setViewReceipt(o); }}
                            className="inline-flex items-center rounded-xl border border-[#D8D6CE] bg-[#ECECE8] px-3.5 py-2 text-xs font-bold text-[#1A1A1A] transition-colors hover:bg-[#D8D6CE]"
                          >
                            Receipt
                          </button>
                          <button
                            onClick={() => { setViewDocType("QUOTATION"); setViewReceipt(o); }}
                            className="inline-flex items-center rounded-xl border border-[#E6D400] bg-[#FFF9D6] px-3.5 py-2 text-xs font-bold text-[#796900] transition-colors hover:bg-[#FFF200]"
                          >
                            Quotation
                          </button>
                          <button
                            onClick={() => { setViewDocType("DELIVERY"); setViewReceipt(o); }}
                            className="inline-flex items-center rounded-xl border border-[#8DEEEE] bg-[#E7FFFF] px-3.5 py-2 text-xs font-bold text-[#006A6A] transition-colors hover:bg-[#00FFFF]"
                          >
                            Delivery
                          </button>
                          <button
                            onClick={() => { setViewDocType("INVOICE"); setViewReceipt(o); }}
                            className="inline-flex items-center rounded-xl border border-[#EFA3D0] bg-[#FFF0F8] px-3.5 py-2 text-xs font-bold text-[#A90063] transition-colors hover:bg-[#EC008C] hover:text-white"
                          >
                            Invoice
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
                            <span className="font-bold text-slate-900">₱{Number(o.total).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Downpayment Paid:</span>
                            <span className="font-bold text-emerald-600">₱{Number(o.downpayment_amount || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                            <span>Remaining Balance:</span>
                            <span className="font-bold text-slate-900">₱{Number(o.balance_amount || 0).toFixed(2)}</span>
                          </div>
                        </div>

                      </div>

                      {/* Actions Banner */}
                      {(canCancel || canRequestRefund || isRefundPending) && (
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                          {canCancel && (
                            <button
                              onClick={() => setCancelModal({ orderId: o.id })}
                              className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                            >
                              Cancel Order
                            </button>
                          )}
                          {canRequestRefund && (
                            <button
                              onClick={() => setRefundRequestModal({ orderId: o.id })}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#EC008C] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#c90076]"
                            >
                              <RefreshCcw size={14} /> Request Refund
                            </button>
                          )}
                          {isRefundPending && (
                            <div className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-semibold text-orange-800 sm:w-auto">
                              Refund request sent — waiting for shop review.
                            </div>
                          )}
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
                        <div className="space-y-3 rounded-2xl border-t border-slate-100 bg-slate-50/50 p-4 pt-4">
                          <p className="text-xs font-bold text-slate-900">Leave a Review for {bInfo.name}</p>
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
