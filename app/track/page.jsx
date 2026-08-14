"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { 
  Truck, Printer, Clock, 
  MapPin, CheckCircle2, 
  Loader2, AlertTriangle, FileText, ShoppingBag,
  Star, Package, XCircle, RefreshCcw, Eye, MessageSquare, AlertOctagon, X
} from "lucide-react";
import ReceiptModal from "@/components/ReceiptModal";

const STATUS_MAP = {
  PENDING:           { icon: <Clock size={16} />,        label: "Pending Confirmation",  color: "bg-amber-50 text-amber-700 border-amber-200" },
  PLACED:            { icon: <CheckCircle2 size={16} />, label: "Order Placed",          color: "bg-blue-50 text-blue-700 border-blue-200" },
  PREPARING:         { icon: <Printer size={16} />,      label: "In Production",         color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  READY_TO_PICK_UP:  { icon: <MapPin size={16} />,       label: "Ready for Pickup",      color: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  RIDER_ON_THE_WAY:  { icon: <Truck size={16} />,        label: "Out for Delivery",      color: "bg-pink-50 text-pink-700 border-pink-200" },
  COMPLETED:         { icon: <CheckCircle2 size={16} />, label: "Order Completed",       color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED:         { icon: <XCircle size={16} />,      label: "Cancelled",             color: "bg-rose-50 text-rose-700 border-rose-200" },
  REFUND_PENDING:    { icon: <RefreshCcw size={16} />,   label: "Refund Processing",     color: "bg-orange-50 text-orange-700 border-orange-200" },
  REFUNDED:          { icon: <RefreshCcw size={16} />,   label: "Refunded by Shop",      color: "bg-teal-50 text-teal-700 border-teal-200" },
  REFUND_CONFIRMED:  { icon: <CheckCircle2 size={16} />, label: "Refund Confirmed",      color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

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
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [viewRefundProof, setViewRefundProof] = useState(null);

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

        const resolvedRole = profile?.role || authUser.user_metadata?.role;
        const customer = resolvedRole === "CUSTOMER";
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
        .eq("id", cancelModal.orderId);

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

  const handleConfirmRefund = async (orderId) => {
    setConfirmingRefundId(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "REFUND_CONFIRMED" })
        .eq("id", orderId);
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
        .eq("id", orderId);
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
    if (targetOrder?.status !== "COMPLETED") {
      return alert("Feedback and rating can only be submitted after delivery or pickup is completed.");
    }
    setSubmittingReviewId(orderId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || "Customer";

      const { error } = await supabase
        .from("orders")
        .update({ rating: rev.rating, feedback: rev.feedback })
        .eq("id", orderId);

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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading your orders...</p>
        </div>
      </main>
    );
  }

  if (!user || !isCustomer) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-6 text-slate-900">
        <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-xl max-w-sm text-center">
          <ShoppingBag size={40} className="mx-auto mb-3 text-slate-400" />
          <h1 className="text-xl font-bold">Customer Portal Only</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">Please sign in with a customer account to view your order history.</p>
          <button onClick={() => router.push('/login')} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-[#EC008C] transition-colors">
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setViewRefundProof(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900">Refund Payment Proof</h3>
              <button onClick={() => setViewRefundProof(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            <img src={viewRefundProof} alt="Refund Proof" className="w-full h-auto rounded-xl border border-slate-200 max-h-[60vh] object-contain" />
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancelModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setCancelModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">Request Order Cancellation</h3>
            <p className="text-xs text-slate-500">Please select or type a reason for cancelling this print order:</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Changed specs, ordered wrong item..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-400 h-24"
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCancelModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-200">
                Back
              </button>
              <button onClick={handleCancelOrder} disabled={cancelling} className="flex-1 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700">
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        
        {/* Header */}
        <section className="bg-white border-b border-slate-200 py-6 px-4 sm:px-6 lg:px-8 relative shadow-sm">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Order Tracking</h1>
              <p className="mt-1 text-xs text-slate-500">Track your active printing jobs, view digital receipts, and confirm order completions.</p>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SMS Notifications: Disabled (In-App Realtime Push Active)</span>
            </div>
          </div>
        </section>

        {/* Orders List */}
        <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-4">
              <ShoppingBag size={48} className="mx-auto text-slate-300" />
              <h2 className="text-lg font-bold text-slate-900">No Orders Yet</h2>
              <p className="text-xs text-slate-500">You haven't placed any print orders yet. Browse our print shop directory to get started!</p>
              <button onClick={() => router.push('/browse')} className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-[#EC008C] transition-colors">
                Find Print Shops
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((o) => {
                const statusInfo = STATUS_MAP[o.status] || { icon: <Clock size={16} />, label: o.status, color: "bg-slate-100 text-slate-800" };
                const bInfo = o.businesses || {};
                const canCancel = o.status === "PLACED" || o.status === "PENDING";
                const isCompleted = o.status === "COMPLETED";
                const isRefunded = o.status === "REFUNDED";

                return (
                  <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
                    <div className="cmyk-bar-sm" />

                    <div className="p-6 sm:p-8 space-y-6">
                      
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-base text-slate-900">{bInfo.name || "Print Shop"}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${statusInfo.color}`}>
                              {statusInfo.icon}
                              <span>{statusInfo.label}</span>
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">Order ID: <strong className="text-slate-800 font-mono">{o.id.split('-')[0].toUpperCase()}</strong> • Placed on {new Date(o.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => { setViewDocType("RECEIPT"); setViewReceipt(o); }}
                            className="px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <FileText size={14} /> Receipt
                          </button>
                          <button
                            onClick={() => { setViewDocType("QUOTATION"); setViewReceipt(o); }}
                            className="px-3.5 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <FileText size={14} /> Quotation
                          </button>
                          <button
                            onClick={() => { setViewDocType("DELIVERY"); setViewReceipt(o); }}
                            className="px-3.5 py-2 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Truck size={14} /> Delivery
                          </button>
                          <button
                            onClick={() => { setViewDocType("INVOICE"); setViewReceipt(o); }}
                            className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Printer size={14} /> Invoice
                          </button>

                          <Link
                            href={`/messages?business=${o.business_id}`}
                            className="px-3.5 py-2 bg-slate-900 text-white hover:bg-[#EC008C] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <MessageSquare size={14} /> Chat Shop
                          </Link>
                        </div>
                      </div>

                      {/* Items & Pricing */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        <div className="md:col-span-2 space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Order Items</p>
                          <div className="space-y-2">
                            {(o.items || []).map((it, idx) => (
                              <div key={idx} className="flex items-start justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
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
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-xs">
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
                      {canCancel && (
                        <div className="pt-4 border-t border-slate-100 flex justify-end">
                          <button
                            onClick={() => setCancelModal({ orderId: o.id })}
                            className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-colors"
                          >
                            Cancel Order
                          </button>
                        </div>
                      )}

                      {/* Refund Confirmation Banner */}
                      {isRefunded && (
                        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-3">
                          <p className="text-xs text-teal-900 font-medium">The print shop has processed a refund for this order. Please check your e-wallet / account balance.</p>
                          <div className="flex gap-2">
                            {o.refund_proof_url && (
                              <button onClick={() => setViewRefundProof(o.refund_proof_url)} className="px-3 py-1.5 bg-white border border-teal-300 text-teal-800 rounded-lg text-xs font-bold">
                                View Refund Proof
                              </button>
                            )}
                            <button onClick={() => handleConfirmRefund(o.id)} disabled={confirmingRefundId === o.id} className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-bold">
                              Confirm Refund Received
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Review Submission for Completed Orders */}
                      {isCompleted && (
                        <div className="pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-3">
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
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#EC008C]"
                          />
                          <button
                            onClick={() => handleReviewSubmit(o.id)}
                            disabled={submittingReviewId === o.id}
                            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-[#EC008C] transition-colors"
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
        </section>

      </main>
    </>
  );
}
