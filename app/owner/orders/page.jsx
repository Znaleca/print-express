"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown, CheckCircle, Eye,
  ExternalLink, Activity, Package, Clock,
  CreditCard, AlertCircle, MapPin, Truck, X, ShoppingBag, Printer, Upload, RefreshCcw, FileText, Loader2
} from "lucide-react";
import dynamic from "next/dynamic";
import ReceiptModal from "@/components/ReceiptModal";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const MANILA_TIME_ZONE = "Asia/Manila";

const formatManilaDateTime = (value) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const ORDER_PAGE_SIZE = 5;
const STATUS_META = {
  PENDING: { label: "Pending", className: "bg-[#FFF200]/30 text-[#665F00] ring-[#FFF200]" },
  PLACED: { label: "Order placed", className: "bg-[#FFF200]/30 text-[#665F00] ring-[#FFF200]" },
  PREPARING: { label: "In production", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  READY_TO_PICK_UP: { label: "Ready for pickup", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  RIDER_ON_THE_WAY: { label: "On the way", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  CANCELLED: { label: "Cancelled", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUNDED: { label: "Refunded", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUND_PENDING: { label: "Refund pending", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUND_CONFIRMED: { label: "Refund confirmed", className: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const STATUS_BUTTON_STYLES = {
  PENDING: "border-[#FFF200] bg-[#FFF200]/20 text-[#665F00] hover:bg-[#FFF200]/40",
  PLACED: "border-[#EC008C] bg-[#EC008C]/10 text-[#A30061] hover:bg-[#EC008C]/20",
  PREPARING: "border-[#00BABA] bg-[#00FFFF]/15 text-[#006B6B] hover:bg-[#00FFFF]/30",
  READY_TO_PICK_UP: "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
  RIDER_ON_THE_WAY: "border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100",
  COMPLETED: "border-slate-700 bg-slate-800 text-white hover:bg-slate-700",
};

function StatusProgress({ status, deliveryType, onSelect, onCancel }) {
  const isCancelled = ["CANCELLED", "REFUNDED", "REFUND_PENDING", "REFUND_CONFIRMED"].includes(status);
  if (isCancelled) {
    const meta = STATUS_META[status] || STATUS_META.CANCELLED;
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
        <AlertCircle size={16} /> {meta.label}
      </div>
    );
  }

  const finalStep = deliveryType === "DELIVERY" ? "RIDER_ON_THE_WAY" : "READY_TO_PICK_UP";
  const orderSteps = ["PENDING", "PLACED", "PREPARING", finalStep, "COMPLETED"];
  const currentIndex = Math.max(0, orderSteps.indexOf(status));
  return (
    <div className="rounded-2xl border border-[#D8D6CE] bg-[#F6F6F2] px-3 py-3 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Order progress</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-[#D8D6CE]">
            Click a step to update
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <X size={13} /> Cancel order
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {orderSteps.map((step, index) => {
          const isComplete = index <= currentIndex;
          const isCurrent = status === step;
          const meta = step === "RIDER_ON_THE_WAY"
            ? { ...STATUS_META.RIDER_ON_THE_WAY, label: "In delivery" }
            : STATUS_META[step];
          const buttonColor = STATUS_BUTTON_STYLES[step] || "border-[#D8D6CE] bg-white text-slate-600 hover:bg-slate-50";
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => onSelect?.(step)}
                disabled={status === step}
                title={`Set status: ${meta.label}`}
                aria-label={`Set order status to ${meta.label}`}
                className={`group flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] sm:gap-2 sm:px-2 ${buttonColor} ${isCurrent ? "-translate-y-0.5 shadow-[0_4px_0_rgba(26,26,26,0.25)]" : "opacity-75 hover:-translate-y-0.5 hover:opacity-100 hover:shadow-sm"} disabled:cursor-default disabled:opacity-100`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-transform group-hover:scale-110 ${isComplete ? "bg-[#1A1A1A] text-[#00FFFF]" : "bg-white text-slate-400 ring-1 ring-[#D8D6CE]"}`}>
                  {isComplete ? <CheckCircle size={14} /> : index + 1}
                </div>
                <span className="truncate text-[9px] font-bold text-current sm:text-[10px]">
                  {meta.label}
                </span>
              </button>
              {index < orderSteps.length - 1 && (
                <div className={`h-0.5 min-w-2 flex-1 ${index < currentIndex ? "bg-[#00FFFF]" : "bg-[#D8D6CE]"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMapOrder, setViewMapOrder] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [refundModal, setRefundModal] = useState(null);
  const [refundFile, setRefundFile] = useState(null);
  const [refundPreview, setRefundPreview] = useState(null);
  const [refundDragActive, setRefundDragActive] = useState(false);
  const [uploadingRefund, setUploadingRefund] = useState(false);
  const [viewRefundProof, setViewRefundProof] = useState(null);
  const [viewDpReceipt, setViewDpReceipt] = useState(null);

  useEffect(() => () => {
    if (refundPreview) URL.revokeObjectURL(refundPreview);
  }, [refundPreview]);

  useEffect(() => {
    let subscription;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, address, phone")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        const { data: ordersData } = await supabase
          .from("orders")
          .select("*")
          .eq("business_id", biz.id)
          .order("created_at", { ascending: false });

        if (ordersData) {
           const ordersWithBiz = ordersData.map(o => ({ ...o, businesses: biz }));
           setOrders(ordersWithBiz);
        }

        subscription = supabase
          .channel(`owner_orders_status_${biz.id}_${Date.now()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "orders",
              filter: `business_id=eq.${biz.id}`
            },
            (payload) => {
              if (payload.eventType === "INSERT") {
                const newOrder = { ...payload.new, businesses: biz };
                setOrders((prev) => [newOrder, ...prev]);
              } else if (payload.eventType === "UPDATE") {
                const updatedOrder = { ...payload.new, businesses: biz };
                setOrders((prev) =>
                  prev.map((o) => (o.id === payload.new.id ? updatedOrder : o))
                );
              }
            }
          )
          .subscribe();
      }
      setLoading(false);
    };
    load();

    return () => {
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );

      if (["PLACED", "READY_TO_PICK_UP", "RIDER_ON_THE_WAY", "COMPLETED"].includes(newStatus)) {
        await sendStatusSms(orderId, newStatus);
      }
    } catch (err) {
      alert(err.message || "Failed to update order status.");
    }
  };

  const sendStatusSms = async (orderId, status) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const smsRes = await fetch("/api/orders/status-sms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
          },
          body: JSON.stringify({ orderId, status }),
        });
    const smsData = await smsRes.json().catch(() => ({}));
    if (!smsRes.ok) {
      console.warn("[Orders] SMS notification failed:", smsData);
      alert(`Order status updated, but SMS failed: ${smsData.error || "Unknown SMS error"}`);
    } else if (smsData.skipped) {
      alert(`Order status updated, but SMS was not sent: ${smsData.reason}`);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          cancel_reason: cancelReason || "Cancelled by shop owner",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", cancelModal.orderId);

      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: "CANCELLED", cancel_reason: cancelReason } : o));
      await sendStatusSms(cancelModal.orderId, "CANCELLED");
      setCancelModal(null);
      setCancelReason("");
    } catch (err) {
      alert(err.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

  const handleRefundFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      alert("Please choose an image file for the refund proof.");
      return;
    }
    setRefundFile(file);
    setRefundPreview(URL.createObjectURL(file));
  };

  const closeRefundModal = () => {
    if (uploadingRefund) return;
    setRefundModal(null);
    setRefundFile(null);
    setRefundPreview(null);
    setRefundDragActive(false);
  };

  const handleUploadRefund = async () => {
    if (!refundModal || !refundFile) return alert("Please select a proof image.");
    setUploadingRefund(true);
    try {
      const optimizedRefund = await optimizeImageForUpload(refundFile);
      const fileExt = getUploadExtension(optimizedRefund);
      const filePath = `refunds/${refundModal.orderId}/${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage.from(IMAGE_BUCKET).upload(filePath, optimizedRefund, {
        cacheControl: "31536000",
        contentType: optimizedRefund.type,
      });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);

      const { error } = await supabase
        .from("orders")
        .update({
          status: "REFUNDED",
          refund_proof_url: publicUrl,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", refundModal.orderId);

      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === refundModal.orderId ? { ...o, status: "REFUNDED", refund_proof_url: publicUrl } : o));
      setRefundModal(null);
      setRefundFile(null);
      setRefundPreview(null);
      alert("Refund proof uploaded successfully.");
    } catch (err) {
      alert(err.message || "Failed to upload refund proof.");
    } finally {
      setUploadingRefund(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    if (activeTab === "ALL") return true;
    if (activeTab === "PENDING") return ["PLACED", "PENDING"].includes(o.status);
    if (activeTab === "PREPARING") return o.status === "PREPARING";
    if (activeTab === "READY") return ["READY_TO_PICK_UP", "RIDER_ON_THE_WAY"].includes(o.status);
    if (activeTab === "COMPLETED") return o.status === "COMPLETED";
    if (activeTab === "CANCELLED") return ["CANCELLED", "REFUNDED", "REFUND_PENDING", "REFUND_CONFIRMED"].includes(o.status);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const pageStart = (currentPage - 1) * ORDER_PAGE_SIZE;
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + ORDER_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  if (loading) {
    return <OwnerPageSkeleton rows={4} />;
  }

  return (
    <>
      {viewReceipt && <ReceiptModal order={viewReceipt} onClose={() => setViewReceipt(null)} isOwner={true} initialDocType={viewDocType} />}

      {/* Downpayment Receipt Popup */}
      {viewDpReceipt && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setViewDpReceipt(null)}>
          <div className="dialog-surface max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900">Payment Proof Image</h3>
              <button onClick={() => setViewDpReceipt(null)} className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            <img src={viewDpReceipt} alt="Downpayment proof" className="w-full h-auto rounded-xl max-h-[60vh] object-contain border border-slate-200" />
          </div>
        </div>
      )}

      {/* Refund Proof Upload Modal */}
      {refundModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={closeRefundModal}>
          <div className="dialog-surface w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EC008C]/10 text-[#EC008C]">
                    <Upload size={21} />
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-slate-950">Upload refund proof</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Add the payment receipt that confirms the refund was sent to the customer.</p>
                </div>
                <button type="button" onClick={closeRefundModal} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Close upload dialog">
                  <X size={19} />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-7">
              <input
                id="refund-proof-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => handleRefundFile(e.target.files?.[0])}
              />
              <label
                htmlFor="refund-proof-file"
                onDragOver={(e) => { e.preventDefault(); setRefundDragActive(true); }}
                onDragLeave={() => setRefundDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setRefundDragActive(false); handleRefundFile(e.dataTransfer.files?.[0]); }}
                className={`group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${refundDragActive ? "border-[#EC008C] bg-[#EC008C]/5" : "border-slate-300 bg-slate-50 hover:border-[#EC008C] hover:bg-[#EC008C]/5"}`}
              >
                {refundPreview ? (
                  <div className="w-full space-y-3">
                    <img src={refundPreview} alt="Refund proof preview" className="mx-auto max-h-48 rounded-xl border border-slate-200 object-contain shadow-sm" />
                    <p className="max-w-full break-words whitespace-normal text-center text-xs font-bold text-slate-800">{refundFile?.name}</p>
                    <p className="text-[11px] font-medium text-slate-500">Click to replace this proof image</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#EC008C] shadow-sm ring-1 ring-slate-200">
                      <Upload size={22} />
                    </div>
                    <p className="text-sm font-black text-slate-900">Choose a proof image</p>
                    <p className="mt-1 text-xs text-slate-500">Drag and drop or click to browse</p>
                  </>
                )}
              </label>
              <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
                <span>PNG, JPG, or WebP</span>
                <span>Optimized up to 5 MB</span>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:px-7">
              <button type="button" onClick={closeRefundModal} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={handleUploadRefund} disabled={uploadingRefund || !refundFile} className="flex-1 rounded-xl bg-[#1A1A1A] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40">
                {uploadingRefund ? "Uploading..." : "Submit proof"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setCancelModal(null)}>
          <div className="dialog-surface max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">Cancel Order</h3>
            <p className="text-xs text-slate-500">Provide a reason for cancelling this order:</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Out of paper stock, equipment maintenance..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-400 h-24"
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCancelModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl">Back</button>
              <button onClick={handleCancelOrder} disabled={cancelling} className="flex-1 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700">
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="owner-orders-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-20">
        
        {/* Header */}
        <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-8 pt-8 text-white sm:px-8 sm:pb-9 sm:pt-10 lg:px-10">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Orders</h1>
              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Review customer orders, move jobs through production, and manage receipts or refunds.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white/10 p-1 ring-1 ring-white/15">
              {["ALL", "PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === tab ? "bg-[#00FFFF] text-[#1A1A1A] shadow-sm" : "text-white/65 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Orders Table & Cards */}
        <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs font-medium text-slate-500 max-w-md mx-auto">
              No orders found under "{activeTab}" filter.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleOrders.map((o) => (
                <div key={o.id} className="space-y-4 rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm">
                  
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">Order #{o.id.split('-')[0].toUpperCase()}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${STATUS_META[o.status]?.className || "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                          {STATUS_META[o.status]?.label || o.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Placed on {new Date(o.created_at).toLocaleString()}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => { setViewDocType("RECEIPT"); setViewReceipt(o); }}
                        className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <FileText size={14} /> Receipt
                      </button>
                      <button
                        onClick={() => { setViewDocType("QUOTATION"); setViewReceipt(o); }}
                        className="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <FileText size={14} /> Quotation Copy
                      </button>
                      <button
                        onClick={() => { setViewDocType("DELIVERY"); setViewReceipt(o); }}
                        className="px-3 py-1.5 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Truck size={14} /> Delivery Receipt
                      </button>
                      <button
                        onClick={() => { setViewDocType("INVOICE"); setViewReceipt(o); }}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Printer size={14} /> Sales Invoice
                      </button>

                      {o.receipt_url && (
                        <button
                          onClick={() => setViewDpReceipt(o.receipt_url)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Eye size={14} /> Payment Proof
                        </button>
                      )}
                    </div>
                  </div>

                  <StatusProgress
                    status={o.status}
                    deliveryType={o.delivery_type}
                    onSelect={(nextStatus) => handleUpdateStatus(o.id, nextStatus)}
                    onCancel={["PENDING", "PLACED", "PREPARING"].includes(o.status) ? () => setCancelModal({ orderId: o.id }) : undefined}
                  />

                  {/* Items List & Customer Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                    <div className="md:col-span-2 space-y-2">
                      <p className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Items Ordered</p>
                      {(o.items || []).map((it, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                          <div className="flex justify-between items-center">
                            <span><strong className="text-slate-900">{it.name}</strong> × {it.quantity || 1}</span>
                            <span className="font-bold text-slate-900">₱{(Number(it.price) * (it.quantity || 1)).toFixed(2)}</span>
                          </div>
                          {it.selected_specs && (
                            <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 space-y-0.5 font-medium">
                              {it.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-900">{it.selected_specs.size}</span></div>}
                              {it.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-900">{it.selected_specs.material}</span></div>}
                              {it.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-900">{it.selected_specs.quality}</span></div>}
                              {it.selected_specs.notes && <div className="text-amber-800 italic">"Notes: {it.selected_specs.notes}"</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                      <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Total & Balance</p>
                      <div className="flex justify-between text-slate-600">
                        <span>Total:</span>
                        <span className="font-bold text-slate-900">₱{Number(o.total).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Downpayment:</span>
                        <span className="font-bold text-emerald-600">₱{Number(o.downpayment_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                        <span>Balance:</span>
                        <span className="font-bold text-slate-900">₱{Number(o.balance_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {(o.status === "CANCELLED" || o.status === "REFUND_PENDING") && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black text-orange-900">{o.status === "REFUND_PENDING" ? "Refund requested by customer" : "Cancellation may require a refund"}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-orange-800">
                          {o.refund_reason || "Review the payment and upload proof after sending the refund."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRefundModal({ orderId: o.id })}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#EC008C] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#c90076]"
                      >
                        <RefreshCcw size={14} /> Process refund
                      </button>
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-3xl border border-[#D8D6CE] bg-white px-5 py-4 text-xs sm:flex-row">
              <p className="text-slate-500">
                Showing <span className="font-bold text-slate-900">{pageStart + 1}–{Math.min(pageStart + ORDER_PAGE_SIZE, filteredOrders.length)}</span> of <span className="font-bold text-slate-900">{filteredOrders.length}</span> orders
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-[#D8D6CE] px-3 py-2 font-bold text-slate-700 transition-colors hover:bg-[#ECECE8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="min-w-20 text-center font-bold text-slate-900">Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full bg-[#1A1A1A] px-3 py-2 font-bold text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

      </main>
    </>
  );
}
