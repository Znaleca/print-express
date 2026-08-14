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

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [viewMapOrder, setViewMapOrder] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [refundModal, setRefundModal] = useState(null);
  const [refundFile, setRefundFile] = useState(null);
  const [uploadingRefund, setUploadingRefund] = useState(false);
  const [viewRefundProof, setViewRefundProof] = useState(null);
  const [viewDpReceipt, setViewDpReceipt] = useState(null);

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

      if (["PREPARING", "READY_TO_PICK_UP", "COMPLETED"].includes(newStatus)) {
        const { data: sessionData } = await supabase.auth.getSession();
        const smsRes = await fetch("/api/orders/status-sms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
          },
          body: JSON.stringify({ orderId, status: newStatus }),
        });
        const smsData = await smsRes.json().catch(() => ({}));
        if (!smsRes.ok) {
          console.warn("[Orders] SMS notification failed:", smsData);
          alert(`Order status updated, but SMS failed: ${smsData.error || "Unknown SMS error"}`);
        } else if (smsData.skipped) {
          alert(`Order status updated, but SMS was not sent: ${smsData.reason}`);
        }
      }
    } catch (err) {
      alert(err.message || "Failed to update order status.");
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
      setCancelModal(null);
      setCancelReason("");
    } catch (err) {
      alert(err.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

  const handleUploadRefund = async () => {
    if (!refundModal || !refundFile) return alert("Please select a proof image.");
    setUploadingRefund(true);
    try {
      const fileExt = refundFile.name.split('.').pop();
      const filePath = `refunds/${refundModal.orderId}-${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage.from("chat-images").upload(filePath, refundFile);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(filePath);

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

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading orders...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      {viewReceipt && <ReceiptModal order={viewReceipt} onClose={() => setViewReceipt(null)} isOwner={true} initialDocType={viewDocType} />}

      {/* Downpayment Receipt Popup */}
      {viewDpReceipt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setViewDpReceipt(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setRefundModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">Upload Refund Payment Receipt</h3>
            <p className="text-xs text-slate-500">Upload the transaction receipt for the refund sent to the customer:</p>
            <input type="file" accept="image/*" onChange={(e) => setRefundFile(e.target.files[0])} className="text-xs text-slate-500" />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setRefundModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl">Cancel</button>
              <button onClick={handleUploadRefund} disabled={uploadingRefund || !refundFile} className="flex-1 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-[#EC008C]">
                {uploadingRefund ? "Uploading..." : "Submit Proof"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setCancelModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
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

      <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        
        {/* Header */}
        <section className="bg-white border-b border-slate-200 py-5 px-4 sm:px-6 lg:px-8 relative shadow-sm">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Order Management</h1>
              <p className="mt-0.5 text-xs text-slate-500">Review client orders, update production status, and manage refunds.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {["ALL", "PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
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
              {filteredOrders.map((o) => (
                <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                  
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">Order #{o.id.split('-')[0].toUpperCase()}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                          {o.status}
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

                  {/* Status Actions */}
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Update Status:</span>
                      {o.status === "PLACED" && (
                        <button
                          onClick={() => handleUpdateStatus(o.id, "PREPARING")}
                          className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
                        >
                          Start Production
                        </button>
                      )}
                      {o.status === "PREPARING" && (
                        <button
                          onClick={() => handleUpdateStatus(o.id, "READY_TO_PICK_UP")}
                          className="px-3.5 py-1.5 bg-cyan-600 text-white rounded-xl text-xs font-bold hover:bg-cyan-700 transition-colors"
                        >
                          Mark Ready for Pickup
                        </button>
                      )}
                      {(o.status === "READY_TO_PICK_UP" || o.status === "PREPARING") && (
                        <button
                          onClick={() => handleUpdateStatus(o.id, "COMPLETED")}
                          className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                        >
                          Mark Complete
                        </button>
                      )}
                    </div>

                    {["PLACED", "PREPARING"].includes(o.status) && (
                      <button
                        onClick={() => setCancelModal({ orderId: o.id })}
                        className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </>
  );
}
