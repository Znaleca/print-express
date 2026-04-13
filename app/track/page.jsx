"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  PackageSearch, Truck, Printer, Clock, 
  MapPin, CheckCircle2, ChevronRight, Hash, 
  Loader2, AlertTriangle, FileText, ShoppingBag,
  Star
} from "lucide-react";

const STATUS_MAP = {
  PLACED:           { icon: <Clock size={16} />,        label: "ORDER_PLACED",      color: "bg-[#F4F4F1] border-black text-black" },
  PREPARING:        { icon: <Printer size={16} />,      label: "PREPARING_ASSETS",  color: "bg-[#FFF200] border-black text-black" },
  READY_TO_PICK_UP: { icon: <MapPin size={16} />,       label: "READY_FOR_PICKUP",  color: "bg-black border-black text-[#FFF200]" },
  RIDER_ON_THE_WAY: { icon: <Truck size={16} />,        label: "RIDER_DISPATCHED",  color: "bg-[#00A8E8] border-black text-white" },
  COMPLETED:        { icon: <CheckCircle2 size={16} />, label: "CYCLE_COMPLETE",    color: "bg-[#FF3E00] border-black text-white" },
};

export default function TrackOrderPage() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Review states mapping: orderId -> { rating, feedback }
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
          
          // Pre-fill existing ratings
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
      [orderId]: {
        ...prev[orderId],
        [key]: value
      }
    }));
  };

  const submitFeedback = async (order) => {
    const rev = reviewsState[order.id];
    if (!rev.rating) return alert("Please select a star rating first.");

    setSubmittingReviewId(order.id);
    const { error } = await supabase
      .from("orders")
      .update({ rating: rev.rating, feedback: rev.feedback })
      .eq("id", order.id)
      .eq("customer_id", user.id); // Extra security

    setSubmittingReviewId(null);

    if (error) {
      alert("Failed to submit review: " + error.message);
    } else {
      // Update local array so it visually locks in
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, rating: rev.rating, feedback: rev.feedback } : o));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-[#F4F4F1] font-mono">
        <Loader2 className="animate-spin text-black mb-4" size={48} />
        <p className="uppercase tracking-[0.3em] text-xs">Syncing_Telemetry...</p>
      </div>
    );
  }

  if (!user || user.user_metadata?.role !== "CUSTOMER") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-[#F4F4F1] p-6">
         <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(255,62,0,1)] max-w-lg w-full text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-[#FF3E00]" />
            <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Access_Denied</h1>
            <p className="font-mono text-sm uppercase opacity-60">You must be logged in as a registered CUSTOMER to view telemetry data.</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#F4F4F1] p-6 font-sans pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-4 border-black pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-[#FF3E00] rotate-45" />
              <span className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-40">Client_Portal_v2</span>
            </div>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-none">Telemetry</h1>
          </div>
          <div className="bg-black text-white px-4 py-2 font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
             <PackageSearch size={14} className="text-[#FFF200]" /> 
             Active_Nodes: {orders.length}
          </div>
        </div>

        {/* ORDERS LIST */}
        {orders.length === 0 ? (
          <div className="border-4 border-dashed border-black/20 p-16 text-center text-black opacity-50 flex flex-col items-center">
             <ShoppingBag size={48} className="mb-4" />
             <p className="font-black uppercase italic text-xl">No_Active_Telemetry_Streams</p>
             <p className="font-mono text-[10px] uppercase tracking-widest mt-2">Browse the directory to initiate a print sequence.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {orders.map((order) => {
              const info = STATUS_MAP[order.status] || STATUS_MAP.PLACED;
              const date = new Date(order.created_at).toLocaleString();
              const items = order.items || [];
              const bInfo = order.businesses || {};
              const revState = reviewsState[order.id] || { rating: 0, feedback: "" };
              const isRated = !!order.rating;

              return (
                <div key={order.id} className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all group overflow-hidden">
                  {/* Status Bar */}
                  <div className={`px-4 py-2 flex justify-between items-center border-b-4 border-black ${info.color}`}>
                     <div className="flex items-center gap-2 font-black uppercase italic text-sm tracking-widest">
                       {info.icon} {info.label}
                     </div>
                     <span className="font-mono text-[10px] tracking-widest font-bold">SYS_UPDATE</span>
                  </div>

                  <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
                    {/* Details */}
                    <div className="flex-1 space-y-6">
                       <div>
                         <h2 className="text-3xl font-black uppercase italic leading-none mb-1">{bInfo.name || "UNKNOWN_UNIT"}</h2>
                         <p className="font-mono text-xs uppercase opacity-50 flex items-center gap-1">
                           <MapPin size={12} /> {bInfo.address || "NO_LOCATION"} / TEL: {bInfo.phone || "N/A"}
                         </p>
                       </div>

                       <div className="space-y-4">
                         <h3 className="font-bold uppercase text-xs border-b border-black pb-2 flex items-center justify-between">
                            Order_Manifest
                            <span className="font-mono text-[9px] opacity-40 tracking-wider text-right">TOTAL: ₱{Number(order.total).toFixed(2)} ({order.payment_method})</span>
                         </h3>
                         <div className="space-y-2">
                           {items.map((it, idx) => (
                             <div key={idx} className="flex justify-between items-start gap-4">
                                <span className="font-mono text-[11px] uppercase truncate">{it.name}</span>
                                <span className="font-mono text-[11px] font-bold">₱{Number(it.price).toFixed(2)}</span>
                             </div>
                           ))}
                         </div>
                       </div>
                       
                       {/* Feedback / Review System */}
                       {order.status === 'COMPLETED' && (
                         <div className="mt-8 border-t-2 border-dashed border-black/20 pt-6">
                           <h3 className="font-black uppercase italic text-sm tracking-widest mb-4 flex items-center gap-2">
                             <Star size={16} fill="currentColor" className="text-[#FFF200]" /> 
                             {isRated ? "Transmission_Logged" : "End_Of_Cycle_Intel"}
                           </h3>
                           
                           {isRated ? (
                             <div className="bg-[#F4F4F1] border-2 border-black p-4">
                               <div className="flex items-center gap-1 mb-2">
                                 {[1,2,3,4,5].map(star => (
                                    <Star key={star} size={14} fill={star <= order.rating ? "black" : "none"} className={star <= order.rating ? "text-black" : "text-gray-300"} />
                                 ))}
                                 <span className="ml-2 font-mono text-[10px] uppercase font-bold tracking-widest">{order.rating}.0 RATING</span>
                               </div>
                               {order.feedback && <p className="text-sm font-mono opacity-80 mt-2">"{order.feedback}"</p>}
                             </div>
                           ) : (
                             <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                               <div className="flex gap-1 mb-4">
                                 {[1,2,3,4,5].map(star => (
                                    <button 
                                      key={star} 
                                      onClick={() => updateReviewState(order.id, 'rating', star)}
                                      className="transition-transform hover:scale-110 active:scale-95"
                                    >
                                      <Star size={24} fill={star <= revState.rating ? "black" : "none"} className={star <= revState.rating ? "text-black" : "text-gray-300 hover:text-black"} />
                                    </button>
                                 ))}
                               </div>
                               <textarea 
                                 value={revState.feedback}
                                 onChange={(e) => updateReviewState(order.id, 'feedback', e.target.value)}
                                 placeholder="Log your operational assessment..."
                                 className="w-full bg-[#F4F4F1] border-2 border-black p-3 font-mono text-xs uppercase resize-none h-20 placeholder:text-black/30 focus:outline-none focus:bg-[#FFF200]/10 transition-colors mb-3"
                               />
                               <button 
                                 onClick={() => submitFeedback(order)}
                                 disabled={submittingReviewId === order.id}
                                 className="bg-black text-white px-4 py-2 font-mono text-[10px] uppercase font-bold tracking-widest hover:bg-[#FF3E00] transition-colors disabled:opacity-50"
                               >
                                 {submittingReviewId === order.id ? "TRANSMITTING..." : "SUBMIT_INTEL"}
                               </button>
                             </div>
                           )}
                         </div>
                       )}

                    </div>

                    {/* Metadata */}
                    <div className="w-full md:w-64 shrink-0 bg-[#F4F4F1] border-2 border-black p-4 flex flex-col justify-between">
                       <div className="space-y-3 font-mono text-[9px] uppercase tracking-widest">
                         <div>
                           <p className="opacity-40">Packet_ID</p>
                           <p className="font-bold text-xs truncate" title={order.id}>{order.id}</p>
                         </div>
                         <div>
                           <p className="opacity-40">Timestamp</p>
                           <p className="font-bold text-xs">{date}</p>
                         </div>
                         <div>
                           <p className="opacity-40">Assets_Linked</p>
                           <p className="font-bold text-xs flex items-center gap-1"><FileText size={12} /> {(order.design_files || []).length} BLUEPRINTS</p>
                         </div>
                       </div>

                       <div className="mt-6 flex justify-end">
                         <Hash size={24} className="text-[#1A1A1A] opacity-20 group-hover:opacity-100 transition-opacity" />
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
