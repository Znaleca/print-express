"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  PackageSearch, Truck, Printer, Clock, 
  MapPin, CheckCircle2, Hash, 
  Loader2, AlertTriangle, FileText, ShoppingBag,
  Star, Activity, Terminal, Package
} from "lucide-react";

const STATUS_MAP = {
  PLACED:            { icon: <Clock size={16} />,        label: "ORDER_PLACED",      color: "bg-white text-black border-white/10" },
  PREPARING:         { icon: <Printer size={16} />,      label: "IN_PRODUCTION",     color: "bg-[#FFF200] text-black border-[#FFF200]" },
  READY_TO_PICK_UP: { icon: <MapPin size={16} />,       label: "AWAITING_PICKUP",   color: "bg-[#00FFFF] text-black border-[#00FFFF]" },
  RIDER_ON_THE_WAY: { icon: <Truck size={16} />,        label: "TRANSIT_ACTIVE",    color: "bg-[#EC008C] text-white border-[#EC008C]" },
  COMPLETED:         { icon: <CheckCircle2 size={16} />, label: "CYCLE_COMPLETE",    color: "bg-black text-[#00FFFF] border-[#00FFFF]" },
};

export default function TrackOrderPage() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewsState, setReviewsState] = useState({});
  const [submittingReviewId, setSubmittingReviewId] = useState(null);

  useEffect(() => {
    async function loadUserAndOrders() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user && user.user_metadata?.role === "CUSTOMER") {
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            businesses ( name, address, phone )
          `)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false });
          
        if (!error && data) {
          setOrders(data);
          const initReviews = {};
          data.forEach(o => {
            initReviews[o.id] = {
              rating: o.rating || 0,
              feedback: o.feedback || ""
            };
          });
          setReviewsState(initReviews);
        }
      }
      setLoading(false);
    }
    loadUserAndOrders();
  }, []);

  const updateReviewState = (orderId, key, value) => {
    setReviewsState(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [key]: value }
    }));
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="uppercase tracking-[0.4em] text-[10px] font-black">Syncing_Telemetry_Stream...</p>
      </div>
    );
  }

  if (!user || user.user_metadata?.role !== "CUSTOMER") {
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
    <div className="min-h-[calc(100vh-80px)] bg-[#FDFDFD] p-8 font-sans pb-32">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* INDUSTRIAL HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b-8 border-[#1A1A1A] pb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={20} className="text-[#EC008C]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">Diagnostic_Feed // Terminal_v.2026</span>
            </div>
            <h1 className="text-7xl font-black uppercase italic tracking-tighter leading-none">Telemetry</h1>
          </div>
          <div className="bg-[#1A1A1A] text-white p-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
             <div className="flex items-center gap-4">
               <Terminal size={24} className="text-[#FFF200]" />
               <div>
                <p className="font-mono text-[8px] uppercase tracking-widest text-white/40">Active_Data_Nodes</p>
                <p className="text-2xl font-black leading-none">{orders.length}</p>
               </div>
             </div>
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
                  <div className={`px-6 py-3 flex justify-between items-center border-b-4 border-[#1A1A1A] ${info.color}`}>
                      <div className="flex items-center gap-3 font-black uppercase italic text-xs tracking-[0.2em]">
                        {info.icon} {info.label}
                      </div>
                      <span className="font-mono text-[9px] tracking-[0.4em] font-black">NODE_001_UPDATED</span>
                  </div>

                  <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x-4 divide-[#1A1A1A]">
                    {/* Primary Info */}
                    <div className="flex-1 p-8">
                      <div className="mb-8">
                        <div className="flex gap-1 mb-3">
                          <div className="w-4 h-1 bg-[#00FFFF]" />
                          <div className="w-4 h-1 bg-[#EC008C]" />
                          <div className="w-4 h-1 bg-[#FFF200]" />
                        </div>
                        <h2 className="text-4xl font-black uppercase italic leading-none">{bInfo.name || "UNNAMED_UNIT"}</h2>
                        <div className="flex items-center gap-3 mt-3">
                          <MapPin size={14} className="text-[#EC008C]" />
                          <p className="font-mono text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                            {bInfo.address} // TEL: {bInfo.phone || "---"}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[#F9F9F7] border-2 border-[#1A1A1A] p-6 relative overflow-hidden">
                        <h3 className="font-black text-[11px] uppercase tracking-[0.2em] mb-4 border-b-2 border-[#1A1A1A] pb-2">Manifest_v1.0</h3>
                        <div className="space-y-3">
                          {items.map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center group/item">
                              <span className="font-mono text-[11px] uppercase font-bold text-gray-600">[{idx+1}] {it.name}</span>
                              <div className="flex-1 border-b-2 border-dotted border-gray-200 mx-4" />
                              <span className="font-mono text-[11px] font-black">₱{Number(it.price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-6 pt-4 border-t-2 border-[#1A1A1A] flex justify-between items-end">
                           <p className="font-mono text-[9px] uppercase tracking-widest opacity-40">Payment_Type: {order.payment_method}</p>
                           <p className="text-2xl font-black">₱{Number(order.total).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Meta & Feedback */}
                    <div className="w-full lg:w-[400px] bg-[#F9F9F7] p-8 flex flex-col justify-between space-y-8">
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black">Packet_Ref</p>
                            <p className="font-mono text-[10px] font-black truncate">#{order.id.split('-')[0]}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black">Blueprint_Link</p>
                            <p className="font-mono text-[10px] font-black flex items-center gap-1">
                              <FileText size={12} className="text-[#00FFFF]" /> {(order.design_files || []).length} ASSETS
                            </p>
                          </div>
                        </div>

                        {/* Fulfillment Route */}
                        <div className="pt-4 border-t-2 border-[#1A1A1A]/10">
                           <p className="font-mono text-[8px] uppercase tracking-widest opacity-40 font-black mb-2">Fulfillment_Route</p>
                           {order.delivery_type === 'DELIVERY' ? (
                             <div className="bg-[#1A1A1A] text-white p-3 border-l-4 border-[#EC008C]">
                               <div className="flex items-center gap-2 font-black text-[10px] mb-1">
                                 <Truck size={12} className="text-[#EC008C]" /> DELIVERY_REQUESTED
                               </div>
                               <p className="font-mono text-[9px] uppercase opacity-70 mt-2">{order.delivery_address || 'ADDRESS_NOT_PROVIDED'}</p>
                             </div>
                           ) : (
                             <div className="bg-white border-2 border-[#1A1A1A] p-3 text-[#1A1A1A]">
                               <div className="flex items-center gap-2 font-black text-[10px]">
                                 <Package size={12} className="text-[#00FFFF]" /> PICK_UP_ONLY
                               </div>
                             </div>
                           )}
                        </div>

                        {/* RATING MODULE */}
                        {order.status === 'COMPLETED' && (
                          <div className="pt-6 border-t-2 border-[#1A1A1A]">
                            <p className="font-black text-[10px] uppercase tracking-[0.2em] mb-4">Operational_Assessment</p>
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
                                      <Star size={20} fill={star <= revState.rating ? "#EC008C" : "none"} className={star <= revState.rating ? "text-[#EC008C]" : "text-gray-300"} />
                                    </button>
                                  ))}
                                </div>
                                <textarea 
                                  value={revState.feedback}
                                  onChange={(e) => updateReviewState(order.id, 'feedback', e.target.value)}
                                  placeholder="Log intel..."
                                  className="w-full bg-white border-2 border-[#1A1A1A] p-3 font-mono text-[10px] uppercase h-20 focus:outline-none focus:ring-2 ring-[#00FFFF]/20"
                                />
                                <button 
                                  onClick={() => submitFeedback(order)}
                                  disabled={submittingReviewId === order.id}
                                  className="w-full bg-[#1A1A1A] text-white py-3 font-black font-mono text-[9px] uppercase tracking-[0.3em] hover:bg-[#00FFFF] hover:text-black transition-all"
                                >
                                  {submittingReviewId === order.id ? "TRANSMITTING..." : "SUBMIT_INTEL"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center opacity-20 group-hover:opacity-100 transition-opacity">
                         <Hash size={32} strokeWidth={3} />
                         <p className="font-mono text-[8px] uppercase font-black text-right tracking-widest">{date}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}