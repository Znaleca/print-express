"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown, CheckCircle, Eye,
  ExternalLink, Activity, Package, Clock,
  CreditCard, AlertCircle, MapPin, Truck, X, ShoppingBag
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
      alert("Status update failed: " + error.message);
    } else {
      setToast({ type: "success", msg: `ORDER_${id.split("-")[0]} SET TO ${newStatus}` });
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E5E5E5] flex flex-col items-center justify-center font-mono p-8">
        <Activity className="animate-spin mb-4 text-[#EC008C]" size={48} />
        <p className="uppercase tracking-[0.3em] text-[10px] font-black animate-pulse text-[#1A1A1A]">
          Loading_Order_Registry...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E5E5E5] p-4 lg:p-8 font-sans text-[#1A1A1A]">
      {/* ── HEADER ── */}
      <div className="border-b-4 border-[#1A1A1A] pb-8 mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-3">
            <ShoppingBag size={32} className="text-[#00FFFF]" /> Order_Management
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-2">
            Transaction Tracking // Order Fulfillment & Status Registry
          </p>
        </div>

        {toast && (
          <div className="bg-[#FFF200] text-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase animate-in fade-in slide-in-from-right-4 border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <CheckCircle size={12} className="inline mr-2" /> {toast.msg}
          </div>
        )}
      </div>

      {/* ── ORDERS TABLE ── */}
      <div className="bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] relative overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
                {["Date", "Order_ID", "Qty", "Delivery_Type", "Transaction", "Payment_Proof", "Design_Files", "Order_Status"].map((h) => (
                  <th key={h} className="p-4 font-mono text-[10px] uppercase tracking-widest font-black whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-black/40 italic uppercase tracking-[0.2em]">
                    No transactions found in database.
                  </td>
                </tr>
              ) : orders.map((order) => {
                const isPaidViaWallet = order.payment_method === 'E-Wallet';

                return (
                  <tr key={order.id} className="border-b-2 border-[#1A1A1A]/10 hover:bg-[#00FFFF]/5 transition-colors group">
                    <td className="p-4 whitespace-nowrap font-bold">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-[#EC008C]" />
                        {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="bg-[#1A1A1A] text-[#FFF200] px-2 py-0.5 font-bold tracking-tighter">
                        #{order.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>

                    <td className="p-4 font-black italic">
                      {order.items?.length || 0} ITEMS
                    </td>

                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {order.delivery_type === 'DELIVERY' ? (
                          <>
                            <span className="bg-[#EC008C] text-white px-2 py-0.5 text-[9px] font-black tracking-widest uppercase w-fit inline-flex items-center gap-1">
                              <Truck size={10} /> SHIPPING
                            </span>
                            {order.delivery_coordinates?.lat && (
                              <button onClick={() => setViewMapOrder(order)} className="text-[#EC008C] hover:text-[#1A1A1A] font-mono text-[9px] font-black flex items-center gap-1 mt-1 text-left underline underline-offset-2">
                                <MapPin size={10} /> VIEW_LOCATION
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

                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-black text-[#1A1A1A] text-sm">₱{Number(order.total).toFixed(2)}</span>
                        <span className="text-[9px] opacity-50 uppercase flex items-center gap-1 font-bold">
                           <CreditCard size={8} /> {order.payment_method}
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      {isPaidViaWallet ? (
                        order.receipt_url ? (
                          <a href={order.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-[#1A1A1A] text-white px-2 py-1 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all font-black text-[9px] uppercase">
                            <Eye size={10} /> Check_Receipt
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#EC008C] font-black text-[9px] uppercase animate-pulse">
                            <AlertCircle size={10} /> Unpaid_Transaction
                          </span>
                        )
                      ) : (
                        <span className="text-[9px] opacity-30 uppercase font-black">Cash_Payment</span>
                      )}
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {(order.design_files || []).length > 0 ? (
                          order.design_files.map((df, i) => (
                            <a key={i} href={df.url} target="_blank" rel="noopener noreferrer" className="bg-white border-2 border-[#1A1A1A] p-1 hover:bg-[#FFF200] transition-all">
                              <ExternalLink size={12} />
                            </a>
                          ))
                        ) : (
                          <span className="text-[9px] opacity-30 uppercase font-bold">No_Files</span>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="relative group/select">
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className={`appearance-none w-full border-2 border-[#1A1A1A] py-2 pl-3 pr-8 font-black italic uppercase text-[10px] tracking-tight cursor-pointer focus:outline-none transition-all ${
                            order.status === 'COMPLETED' ? 'bg-[#00FFFF] text-[#1A1A1A]' : 'bg-white'
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="PLACED">PLACED</option>
                          <option value="PREPARING">PREPARING</option>
                          <option value="READY_TO_PICK_UP">READY</option>
                          <option value="RIDER_ON_THE_WAY">TRANSIT</option>
                          <option value="COMPLETED">COMPLETE</option>
                          <option value="CANCELLED">CANCELLED</option>
                          <option value="REFUNDED">REFUNDED</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-transform" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="mt-6 flex justify-between items-center font-mono text-[9px] uppercase opacity-40">
        <div className="flex gap-4">
          <span>Log: Verified</span>
          <span>Access: Business_Owner</span>
        </div>
        <span>Total_Orders: {orders.length}</span>
      </div>

      {/* ── MAP MODAL ── */}
      {viewMapOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#1A1A1A]/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-4 border-[#1A1A1A] p-6 shadow-[12px_12px_0px_0px_rgba(0,255,242,1)] max-w-2xl w-full relative">
            <button 
              onClick={() => setViewMapOrder(null)}
              className="absolute top-4 right-4 text-[#1A1A1A] hover:text-[#EC008C] transition-colors"
            >
              <X size={24} />
            </button>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2 mb-2">
              <MapPin className="text-[#EC008C]" /> Location_Intel
            </h2>
            <div className="font-mono text-[10px] uppercase font-bold tracking-widest bg-gray-100 p-2 border-2 border-[#1A1A1A] mb-6">
               <span className="opacity-40">Destination // </span>
               <span>{viewMapOrder.delivery_address || 'UNSPECIFIED'}</span>
            </div>
            
            {viewMapOrder.delivery_coordinates?.lat && (
              <div className="border-4 border-[#1A1A1A] h-[300px] overflow-hidden pointer-events-none relative">
                <LocationPicker 
                  lat={viewMapOrder.delivery_coordinates.lat} 
                  lng={viewMapOrder.delivery_coordinates.lng} 
                />
              </div>
            )}
            
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${viewMapOrder.delivery_coordinates?.lat},${viewMapOrder.delivery_coordinates?.lng}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="block w-full bg-[#1A1A1A] text-white text-center py-4 mt-6 font-mono text-[10px] font-black uppercase tracking-widest hover:bg-[#EC008C] transition-colors"
            >
              OPEN_IN_MAPS
            </a>
          </div>
        </div>
      )}
    </div>
  );
}