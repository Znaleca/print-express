"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  Truck, Printer, Clock, 
  MapPin, CheckCircle2, Hash, 
  Loader2, AlertTriangle, FileText, ShoppingBag,
  Star, Activity, Terminal, Package, XCircle, RefreshCcw, Upload, Eye
} from "lucide-react";

// Updated Status Map with exact requested labels
const STATUS_MAP = {
  PENDING:           { icon: <Clock size={16} />,        label: "PENDING",           color: "bg-blue-100 text-blue-800 border-blue-200" },
  PLACED:            { icon: <CheckCircle2 size={16} />, label: "ORDER_PLACED",      color: "bg-white text-black border-black/10" },
  PREPARING:         { icon: <Printer size={16} />,      label: "PREPARING",         color: "bg-[#FFF200] text-black border-[#FFF200]" },
  READY_TO_PICK_UP:  { icon: <MapPin size={16} />,       label: "READY_TO_PICK_UP",  color: "bg-[#00FFFF] text-black border-[#00FFFF]" },
  RIDER_ON_THE_WAY:  { icon: <Truck size={16} />,        label: "RIDER_ON_THE_WAY",  color: "bg-[#EC008C] text-white border-[#EC008C]" },
  COMPLETED:         { icon: <CheckCircle2 size={16} />, label: "COMPLETED",         color: "bg-black text-[#00FFFF] border-[#00FFFF]" },
  CANCELLED:         { icon: <XCircle size={16} />,      label: "CANCELLED",         color: "bg-red-500 text-white border-red-500" },
  REFUND_PENDING:    { icon: <RefreshCcw size={16} />,   label: "REFUND_PENDING",    color: "bg-orange-400 text-white border-orange-400" },
  REFUNDED:          { icon: <RefreshCcw size={16} />,   label: "REFUNDED_BY_SELLER", color: "bg-green-500 text-white border-green-500" },
  REFUND_CONFIRMED:  { icon: <CheckCircle2 size={16} />, label: "REFUND_CONFIRMED",  color: "bg-green-700 text-white border-green-700" },
};

export default function TrackOrderPage() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCustomer, setIsCustomer] = useState(false);
  const [reviewsState, setReviewsState] = useState({});
  const [submittingReviewId, setSubmittingReviewId] = useState(null);
  const [confirmingRefundId, setConfirmingRefundId] = useState(null);

  useEffect(() => {
    let isActive = true;
    let subscription;

    async function loadUserAndOrders() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!isActive) return;
      setUser(authUser);

      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authUser.id)
        .single();

      const resolvedRole = profile?.role || authUser.user_metadata?.role;
      const customer = resolvedRole === "CUSTOMER";
      setIsCustomer(customer);

      if (!customer) {
        setLoading(false);
        return;
      }

      const fetchOrders = async () => {
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            businesses ( name, address, phone )
          `)
          .eq("customer_id", authUser.id)
          .order("created_at", { ascending: false });

        if (!isActive || error || !data) return;

        setOrders(data);
        const initReviews = {};
        data.forEach((o) => {
          initReviews[o.id] = {
            rating: o.rating || 0,
            feedback: o.feedback || "",
          };
        });
        setReviewsState(initReviews);
      };

      await fetchOrders();

      // Realtime subscription for status and order lifecycle changes.
      const channelName = `customer_orders_status_${authUser.id}_${Date.now()}`;
      subscription = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `customer_id=eq.${authUser.id}`,
          },
          async () => {
            await fetchOrders();
          }
        )
        .subscribe();

      setLoading(false);
    }
    loadUserAndOrders();

    return () => {
      isActive = false;
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  const updateReviewState = (orderId, key, value) => {
    setReviewsState(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [key]: value }
    }));
  };

  const cancelOrder = async (orderId) => {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    const { error } = await supabase.from("orders").update({ status: "CANCELLED" }).eq("id", orderId).eq("customer_id", user.id);
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "CANCELLED" } : o));
    } else {
      alert("Failed to cancel: " + error.message);
    }
  };

  const submitFeedback = async (order) => {
    const rev = reviewsState[order.id];
    if (!rev.rating) return alert("Select a star rating.");

    setSubmittingReviewId(order.id);
    const { error } = await supabase
      .from("orders")
      .update({ rating: rev.rating, feedback: rev.feedback })
      .eq("id", order.id)
      .eq("customer_id", user.id);

    setSubmittingReviewId(null);

    if (error) {
      alert("Failed: " + error.message);
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, rating: rev.rating, feedback: rev.feedback } : o));
    }
  };

  const confirmRefundReceived = async (orderId) => {
    if (!confirm("Confirm that you have received your refund from the seller?")) return;
    setConfirmingRefundId(orderId);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'REFUND_CONFIRMED' })
      .eq('id', orderId)
      .eq('customer_id', user.id);
    setConfirmingRefundId(null);
    if (error) {
      alert("Failed to confirm: " + error.message);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'REFUND_CONFIRMED' } : o));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="uppercase tracking-[0.4em] text-[10px] font-black">Syncing_Telemetry_Stream...</p>
      </div>
    );
  }

  if (!user || !isCustomer) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-[#FDFDFD] p-6">
         <div className="bg-[#1A1A1A] border-l-8 border-[#EC008C] p-10 text-white max-w-lg w-full">
            <AlertTriangle size={48} className="mb-6 text-[#EC008C]" />
            <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Auth_Required</h1>
            <p className="font-mono text-xs uppercase opacity-50 tracking-widest">Client credentials missing from active session.</p>
         </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#FDFDFD] font-sans overflow-x-hidden">
      <section className="relative px-6 pb-24 pt-10 md:px-10 md:pt-12">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative w-full space-y-12">
        
        {/* INDUSTRIAL HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b-8 border-[#1A1A1A] pb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={20} className="text-[#EC008C]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">ORDER_STATUS_MONITOR // v.2026</span>
            </div>
            <h1 className="text-7xl font-black uppercase italic tracking-tighter leading-none">Tracking</h1>
          </div>
          <div className="bg-[#1A1A1A] text-white p-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
             <div className="flex items-center gap-4">
               <Terminal size={24} className="text-[#FFF200]" />
               <div>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/40">Total_Requests</p>
                <p className="text-2xl font-black leading-none">{orders.length}</p>
               </div>
             </div>
          </div>
        </div>

        <div className="border-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
          <div className="flex items-center gap-6 px-5 font-mono text-[10px] font-black uppercase tracking-[0.35em] text-white md:px-6">
            <span className="text-[#00FFFF]">Cyan</span>
            <span className="text-[#EC008C]">Magenta</span>
            <span className="text-[#FFF200]">Yellow</span>
            <span>Black</span>
          </div>
        </div>

        {/* LISTING */}
        {orders.length === 0 ? (
          <div className="border-4 border-dashed border-[#1A1A1A]/10 py-32 text-center">
             <ShoppingBag size={64} className="mx-auto mb-6 text-gray-200" />
             <p className="font-black uppercase italic text-2xl text-gray-300">Null_Sequence_Detected</p>
          </div>
        ) : (
          <div className="grid gap-10">
            {orders.map((order) => {
              const info = STATUS_MAP[order.status] || STATUS_MAP.PLACED;
              const date = new Date(order.created_at).toLocaleString();
              const items = order.items || [];
              const bInfo = order.businesses || {};
              const revState = reviewsState[order.id] || { rating: 0, feedback: "" };
              const isRated = !!order.rating;

              return (
                <div key={order.id} className="bg-white border-4 border-[#1A1A1A] overflow-hidden group">
                  {/* Status Strip */}
                  <div className={`px-6 py-4 flex justify-between items-center border-b-4 border-[#1A1A1A] ${info.color}`}>
                      <div className="flex items-center gap-3 font-black uppercase italic text-sm tracking-[0.2em]">
                        {info.icon} {info.label}
                      </div>
                      <span className="font-mono text-[9px] tracking-[0.4em] font-black opacity-50 text-right uppercase">System_State_Active</span>
                  </div>

                  <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x-4 divide-[#1A1A1A]">
                    {/* Primary Info */}
                    <div className="flex-1 p-8">
                      <div className="mb-8">
                        <div className="flex gap-1 mb-3">
                          <div className="w-8 h-2 bg-[#00FFFF]" />
                          <div className="w-8 h-2 bg-[#EC008C]" />
                          <div className="w-8 h-2 bg-[#FFF200]" />
                        </div>
                        <h2 className="text-5xl font-black uppercase italic leading-none tracking-tighter">{bInfo.name || "UNNAMED_UNIT"}</h2>
                        <div className="flex items-center gap-3 mt-4">
                          <MapPin size={14} className="text-[#EC008C]" />
                          <p className="font-mono text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                            {bInfo.address} // TEL: {bInfo.phone || "---"}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[#F9F9F7] border-4 border-[#1A1A1A] p-6 relative overflow-hidden">
                        <h3 className="font-black text-[12px] uppercase tracking-[0.2em] mb-4 border-b-4 border-[#1A1A1A] pb-2">Manifest_Content</h3>
                        <div className="space-y-3">
                          {items.map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center group/item">
                              <span className="font-mono text-[11px] uppercase font-bold text-gray-600">[{idx+1}] {it.name}</span>
                              <div className="flex-1 border-b-2 border-dotted border-gray-200 mx-4" />
                              <span className="font-mono text-[11px] font-black">₱{Number(it.price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-6 pt-4 border-t-4 border-[#1A1A1A] flex justify-between items-end">
                           <div>
                             <p className="font-mono text-[9px] uppercase tracking-widest opacity-60 font-black text-[#EC008C]">DP Paid: ₱{Number(order.downpayment_amount || 0).toFixed(2)}</p>
                             <p className="font-mono text-[9px] uppercase tracking-widest opacity-60 font-black mt-1">Balance ({order.payment_method}): ₱{Number(order.balance_amount || 0).toFixed(2)}</p>
                           </div>
                           <div className="text-right">
                             <p className="font-mono text-[9px] uppercase tracking-widest opacity-40 mb-1">Gross Total</p>
                             <p className="text-3xl font-black leading-none">₱{Number(order.total).toFixed(2)}</p>
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* Meta & Feedback */}
                    <div className="w-full lg:w-[420px] bg-[#F9F9F7] p-8 flex flex-col justify-between space-y-8">
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black">Request_ID</p>
                            <p className="font-mono text-[10px] font-black truncate bg-[#1A1A1A] text-white px-2 py-1">#{order.id.split('-')[0]}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black">Assets_Attached</p>
                            <p className="font-mono text-[10px] font-black flex items-center gap-1">
                              <FileText size={12} className="text-[#00FFFF]" /> {(order.design_files || []).length} FILES
                            </p>
                          </div>
                        </div>

                        {/* Fulfillment Route */}
                        <div className="pt-4 border-t-2 border-[#1A1A1A]/10">
                           <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black mb-2">Fulfillment_Type</p>
                           {order.delivery_type === 'DELIVERY' ? (
                             <div className="bg-[#1A1A1A] text-white p-4 border-l-8 border-[#EC008C]">
                               <div className="flex items-center gap-2 font-black text-[11px] mb-1">
                                 <Truck size={14} className="text-[#EC008C]" /> {order.delivery_type}
                               </div>
                               <p className="font-mono text-[9px] uppercase opacity-70 mt-2 leading-relaxed">{order.delivery_address || 'ADDRESS_MISSING'}</p>
                             </div>
                           ) : (
                             <div className="bg-white border-4 border-[#1A1A1A] p-4 text-[#1A1A1A]">
                               <div className="flex items-center gap-2 font-black text-[11px]">
                                 <Package size={14} className="text-[#00FFFF]" /> {order.delivery_type}
                               </div>
                             </div>
                           )}
                        </div>

                        {/* FULLY PAID BADGE for completed orders */}
                        {order.status === 'COMPLETED' && (
                          <div className="pt-4 border-t-4 border-[#00FFFF]/30">
                            <div className="bg-[#00FFFF] border-4 border-[#1A1A1A] p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex items-center gap-3">
                              <CheckCircle2 size={20} className="text-[#1A1A1A] flex-shrink-0" />
                              <div>
                                <p className="font-black text-[11px] uppercase tracking-[0.2em] text-[#1A1A1A]">FULLY_PAID</p>
                                <p className="font-mono text-[9px] uppercase opacity-60 text-[#1A1A1A]">Order complete. Balance: ₱0.00</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* RATING MODULE */}
                        {order.status === 'COMPLETED' && (
                          <div className="pt-6 border-t-4 border-[#1A1A1A]">
                            <p className="font-black text-[10px] uppercase tracking-[0.2em] mb-4">User_Feedback_Log</p>
                            {isRated ? (
                              <div className="bg-white border-2 border-[#1A1A1A] p-4 shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]">
                                <div className="flex gap-1 mb-2">
                                  {[1,2,3,4,5].map(s => (
                                    <Star key={s} size={12} fill={s <= order.rating ? "#1A1A1A" : "none"} className={s <= order.rating ? "text-[#1A1A1A]" : "text-gray-200"} />
                                  ))}
                                </div>
                                <p className="font-mono text-[10px] uppercase italic opacity-60">"{order.feedback}"</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex gap-2">
                                  {[1,2,3,4,5].map(star => (
                                    <button 
                                      key={star} 
                                      onClick={() => updateReviewState(order.id, 'rating', star)}
                                      className="hover:scale-110 transition-transform"
                                    >
                                      <Star size={24} fill={star <= revState.rating ? "#EC008C" : "none"} className={star <= revState.rating ? "text-[#EC008C]" : "text-gray-300"} />
                                    </button>
                                  ))}
                                </div>
                                <textarea 
                                  value={revState.feedback}
                                  onChange={(e) => updateReviewState(order.id, 'feedback', e.target.value)}
                                  placeholder="Type feedback here..."
                                  className="w-full bg-white border-4 border-[#1A1A1A] p-3 font-mono text-[10px] uppercase h-20 focus:outline-none focus:ring-4 ring-[#00FFFF]/20"
                                />
                                <button 
                                  onClick={() => submitFeedback(order)}
                                  disabled={submittingReviewId === order.id}
                                  className="w-full bg-[#1A1A1A] text-white py-4 font-black font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-[#00FFFF] hover:text-black transition-all"
                                >
                                  {submittingReviewId === order.id ? "TRANSMITTING..." : "SUBMIT_DATA"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* REFUND MODULE — customer confirms after seller sends money */}
                        {order.status === 'REFUNDED' && (
                          <div className="pt-6 border-t-4 border-green-500/20">
                            <p className="font-black text-[10px] uppercase tracking-[0.2em] mb-3 text-green-600">Refund_Sent_By_Seller</p>
                            <p className="font-mono text-[9px] uppercase opacity-60 mb-4">The seller has marked your ₱{Number(order.downpayment_amount || 0).toFixed(2)} refund as sent. Click below once you have received it.</p>
                            <button
                              onClick={() => confirmRefundReceived(order.id)}
                              disabled={confirmingRefundId === order.id}
                              className="w-full bg-green-500 text-white border-4 border-[#1A1A1A] py-4 font-black font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:shadow-none flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 size={16} />
                              {confirmingRefundId === order.id ? 'CONFIRMING...' : 'I RECEIVED MY REFUND'}
                            </button>
                          </div>
                        )}

                        {order.status === 'REFUND_CONFIRMED' && (
                          <div className="pt-6 border-t-4 border-green-700/20">
                            <div className="bg-green-50 border-4 border-green-700 p-4 flex items-center gap-3">
                              <CheckCircle2 size={20} className="text-green-700 flex-shrink-0" />
                              <div>
                                <p className="font-black text-[10px] uppercase tracking-[0.2em] text-green-700">Refund_Confirmed</p>
                                <p className="font-mono text-[9px] uppercase opacity-60">You confirmed receiving your refund.</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {order.status === 'CANCELLED' && (
                          <div className="pt-6 border-t-4 border-red-500/20">
                            <p className="font-black text-[10px] uppercase tracking-[0.2em] mb-3 text-red-500">Order_Cancelled</p>
                            <p className="font-mono text-[9px] uppercase opacity-60">Your order has been cancelled. The seller will process your refund of ₱{Number(order.downpayment_amount || 0).toFixed(2)} and you will be notified here.</p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center mt-4 pt-4 border-t-2 border-[#1A1A1A]/5">
                         {(order.status === "PENDING" || order.status === "PLACED") && (
                           <button onClick={() => cancelOrder(order.id)} className="font-mono text-[9px] uppercase font-black text-red-500 hover:text-white hover:bg-red-500 tracking-widest border-2 border-red-500 px-3 py-1 transition-all">
                             CANCEL_REQUEST
                           </button>
                         )}
                         <div className="flex items-center gap-2 ml-auto text-gray-400">
                           <Hash size={18} strokeWidth={3} />
                           <p className="font-mono text-[8px] uppercase font-black text-right tracking-widest leading-none">{date}</p>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </section>
    </main>
  );
}