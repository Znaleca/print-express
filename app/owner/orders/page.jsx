"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ShoppingBag, ChevronDown, CheckCircle, Eye,
  ExternalLink, Activity, Package, Clock,
  CreditCard, FileText, AlertCircle, MapPin, Truck, X
} from "lucide-react";
import dynamic from "next/dynamic";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [viewMapOrder, setViewMapOrder] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
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

        if (ordersData) setOrders(ordersData);
      }
      setLoading(false);
    };
    load();
  }, []);

  const updateStatus = async (id, newStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));

    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      alert("Failed to update status: " + error.message);
    } else {
      setToast({ type: "success", msg: `ORDER_${id.split("-")[0]} STATE: ${newStatus}` });
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F4F1] flex flex-col items-center justify-center font-mono p-8">
        <Activity className="animate-spin mb-4 text-[#FF3E00]" size={48} />
        <p className="uppercase tracking-[0.3em] text-xs animate-pulse">Syncing_Order_Registry...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F1] p-4 lg:p-8 font-sans text-black">
      {/* ── HEADER ── */}
      <div className="border-b-4 border-black pb-8 mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-3">
            <Package size={32} className="text-[#FF3E00]" /> Fleet_Operations
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-2">
            Control center for fulfillment, blueprint intel, and payment verification.
          </p>
        </div>

        {toast && (
          <div className="bg-black text-[#FFF200] px-4 py-2 font-mono text-[10px] uppercase animate-in fade-in slide-in-from-right-4 border-2 border-black">
            <CheckCircle size={12} className="inline mr-2" /> {toast.msg}
          </div>
        )}
      </div>

      {/* ── ORDERS TABLE ── */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
        {/* CRT Overlay Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-4 border-black bg-black text-white">
                {["Timestamp", "Operation_ID", "Assets", "Fulfillment", "Valuation", "Receipt", "Intel", "Execution_State"].map((h) => (
                  <th key={h} className="p-4 font-mono text-[10px] uppercase tracking-widest font-black whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-black/40 italic uppercase tracking-[0.2em]">
                    No active operations detected in registry.
                  </td>
                </tr>
              ) : orders.map((order) => {
                const isPaidViaWallet = order.payment_method === 'E-Wallet';

                return (
                  <tr key={order.id} className="border-b-2 border-black/10 hover:bg-[#FFF200]/10 transition-colors group">
                    {/* Timestamp */}
                    <td className="p-4 whitespace-nowrap font-bold">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="opacity-30" />
                        {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Operation ID */}
                    <td className="p-4">
                      <span className="bg-black text-[#FFF200] px-2 py-0.5 font-bold tracking-tighter">
                        {order.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>

                    {/* Assets Count */}
                    <td className="p-4 font-black italic">
                      {order.items?.length || 0} UNITS
                    </td>

                    {/* Fulfillment */}
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {order.delivery_type === 'DELIVERY' ? (
                          <>
                            <span className="bg-[#EC008C] text-white px-2 py-0.5 text-[9px] font-black tracking-widest uppercase w-fit inline-flex items-center gap-1">
                              <Truck size={10} /> DELIVERY
                            </span>
                            {order.delivery_address && (
                              <span className="text-[9px] font-mono mt-1 opacity-70 truncate max-w-[150px]" title={order.delivery_address}>
                                {order.delivery_address}
                              </span>
                            )}
                            {order.delivery_coordinates && order.delivery_coordinates.lat && (
                              <button onClick={() => setViewMapOrder(order)} className="text-[#FF3E00] hover:underline font-mono text-[9px] flex items-center gap-1 mt-1 text-left">
                                <MapPin size={10} /> View Map
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="bg-[#00FFFF] text-[#1A1A1A] px-2 py-0.5 text-[9px] font-black tracking-widest uppercase w-fit inline-flex items-center gap-1">
                            <Package size={10} /> PICK_UP
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Valuation */}
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-black text-[#FF3E00] text-sm">₱{Number(order.total).toFixed(2)}</span>
                        <span className="text-[9px] opacity-50 uppercase flex items-center gap-1">
                           <CreditCard size={8} /> {order.payment_method}
                        </span>
                      </div>
                    </td>

                    {/* Receipt Verification */}
                    <td className="p-4">
                      {isPaidViaWallet ? (
                        order.receipt_url ? (
                          <a href={order.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 hover:bg-blue-700 hover:text-white transition-all font-black text-[9px] uppercase border border-blue-700/20">
                            <Eye size={10} /> Verify_Proof
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-black text-[9px] uppercase animate-pulse">
                            <AlertCircle size={10} /> Payment_Missing
                          </span>
                        )
                      ) : (
                        <span className="text-[9px] opacity-30 uppercase">Offline_Cash</span>
                      )}
                    </td>

                    {/* Intel (Files) */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {(order.design_files || []).length > 0 ? (
                          order.design_files.map((df, i) => (
                            <a key={i} href={df.url} target="_blank" rel="noopener noreferrer" className="bg-[#EBEBE8] border border-black/10 p-1 hover:border-[#FF3E00] group/file transition-all">
                              <ExternalLink size={12} className="group-hover/file:text-[#FF3E00]" />
                            </a>
                          ))
                        ) : (
                          <span className="text-[9px] opacity-30 uppercase font-bold">No_Data</span>
                        )}
                      </div>
                    </td>

                    {/* Execution State (Select) */}
                    <td className="p-4">
                      <div className="relative group/select">
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className={`appearance-none w-full bg-[#EBEBE8] border-2 border-black py-2 pl-3 pr-8 font-black italic uppercase text-[10px] tracking-tight cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FFF200] transition-all ${order.status === 'COMPLETED' ? 'bg-[#FF3E00] text-white' : ''
                            }`}
                        >
                          <option value="PLACED">01_PLACED</option>
                          <option value="PREPARING">02_PREPARING</option>
                          <option value="READY_TO_PICK_UP">03_READY</option>
                          <option value="RIDER_ON_THE_WAY">04_TRANSIT</option>
                          <option value="COMPLETED">05_COMPLETE</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none group-hover/select:translate-y-[-40%] transition-transform" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FOOTER TELEMETRY ── */}
      <div className="mt-6 flex justify-between items-center font-mono text-[9px] uppercase opacity-40">
        <div className="flex gap-4">
          <span>Buffer: Nominal</span>
          <span>Security: Level_2_Auth</span>
        </div>
        <span>Total_Records: {orders.length}</span>
      </div>

      {/* ── MAP MODAL ── */}
      {viewMapOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-4 border-black p-6 shadow-[12px_12px_0px_0px_rgba(255,62,0,1)] max-w-2xl w-full relative">
            <button 
              onClick={() => setViewMapOrder(null)}
              className="absolute top-4 right-4 text-black hover:text-[#FF3E00] transition-colors"
            >
              <X size={24} />
            </button>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2 mb-2">
              <MapPin className="text-[#FF3E00]" /> Delivery Route
            </h2>
            <div className="flex gap-2 font-mono text-[10px] uppercase font-bold tracking-widest bg-gray-100 p-2 border-2 border-black mb-6">
               <span className="text-black/50">Destination //</span>
               <span>{viewMapOrder.delivery_address || 'ADDRESS_UNAVAILABLE'}</span>
            </div>
            
            {viewMapOrder.delivery_coordinates && viewMapOrder.delivery_coordinates.lat && (
              <div className="border-4 border-black relative pointer-events-none">
                {/* Pointer events none to make it view-only */}
                <LocationPicker 
                  lat={viewMapOrder.delivery_coordinates.lat} 
                  lng={viewMapOrder.delivery_coordinates.lng} 
                />
              </div>
            )}
            
            <a 
              href={`https://www.google.com/maps?q=${viewMapOrder.delivery_coordinates?.lat},${viewMapOrder.delivery_coordinates?.lng}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="block w-full bg-black text-white text-center py-3 mt-6 font-mono text-[10px] font-black uppercase tracking-widest hover:bg-[#FF3E00] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}