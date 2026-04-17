"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown, CheckCircle, Eye,
  ExternalLink, Activity, Package, Clock,
  CreditCard, AlertCircle, MapPin, Truck, X, ShoppingBag, Printer
} from "lucide-react";
import dynamic from "next/dynamic";

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
  const [toast, setToast] = useState(null);
  const [viewMapOrder, setViewMapOrder] = useState(null);

  useEffect(() => {
    let subscription;

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

        // Realtime Subscription
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
                setOrders((prev) => [payload.new, ...prev]);
              } else if (payload.eventType === "UPDATE") {
                setOrders((prev) =>
                  prev.map((o) => (o.id === payload.new.id ? payload.new : o))
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
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  const updateStatus = async (id, newStatus, extraUpdates = {}) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    if (newStatus === 'COMPLETED') {
      extraUpdates = { ...extraUpdates, balance_amount: 0, fully_paid: true };
    }

    const terminalCancelledStates = ['CANCELLED', 'REFUNDED', 'REFUND_CONFIRMED'];
    const isCurrentlyCancelled = terminalCancelledStates.includes(order.status);
    const isMovingToCancelled = terminalCancelledStates.includes(newStatus);
    
    if (!isCurrentlyCancelled && isMovingToCancelled) {
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          if (!item.service_id) continue;
          const { data: svc } = await supabase
            .from('services')
            .select('stock_qty')
            .eq('id', item.service_id)
            .single();
          
          if (svc) {
            await supabase
              .from('services')
              .update({ stock_qty: (svc.stock_qty || 0) + (Number(item.quantity) || 1) })
              .eq('id', item.service_id);
          }
        }
      }
    }

    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus, ...extraUpdates } : o)));

    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus, ...extraUpdates })
      .eq("id", id);

    if (error) {
      alert("Status update failed: " + error.message);
    } else {
      setToast({ type: "success", msg: `ORDER_${id.split("-")[0]} SET TO ${newStatus}` });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const getOrderTotalQuantity = (order) => {
    if (!Array.isArray(order?.items) || order.items.length === 0) return 0;
    return order.items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center font-mono p-8 text-[#1A1A1A]">
        <Activity className="animate-spin mb-4 text-[#00FFFF]" size={48} />
        <p className="uppercase tracking-[0.35em] text-[10px] font-black animate-pulse text-[#1A1A1A]">
          Loading_Order_Registry...
        </p>
      </div>
    );
  }

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden font-sans">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Order_Intel // Fulfillment_Console
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                Order_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Control Deck</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Track live transactions, update delivery states, and confirm payment lifecycle events from one command surface.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Live Orders</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">{orders.length} Records</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <ShoppingBag className="h-6 w-6 text-[#00FFFF]" />
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                <div className="h-1 flex-1 bg-[#00FFFF]" />
                <div className="h-1 flex-1 bg-[#EC008C]" />
                <div className="h-1 flex-1 bg-[#FFF200]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <Printer size={14} className="text-white" />
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1920px] px-4 py-8 md:px-10 md:py-14">
        {/* ── HEADER ── */}
        <div className="mb-8 flex flex-col justify-between gap-4 border-b-4 border-[#1A1A1A] pb-6 md:flex-row md:items-end">
          <div>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter flex items-center gap-3">
              <ShoppingBag size={30} className="text-[#00FFFF]" /> Order_Management
            </h2>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-60">
              Transaction Tracking // Order Fulfillment & Status Registry
            </p>
          </div>

          {toast && (
            <div className="bg-[#FFF200] text-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase animate-in fade-in slide-in-from-right-4 border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
              <CheckCircle size={12} className="inline mr-2" /> {toast.msg}
            </div>
          )}
        </div>

      {/* ── ORDERS TABLE ── */}
      <div className="bg-white border-4 border-[#1A1A1A] shadow-[10px_10px_0px_0px_rgba(236,0,140,1)] relative overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
                {[
                  "Date",
                  "Order_ID",
                  "Qty",
                  "Delivery_Type",
                  "Schedule",
                  "Transaction",
                  "Payment_Proof",
                  "Design_Files",
                  "Order_Status",
                ].map((h) => (
                  <th key={h} className="p-4 font-mono text-[10px] uppercase tracking-widest font-black whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-12 text-center text-black/40 italic uppercase tracking-[0.2em]">
                    No transactions found in database.
                  </td>
                </tr>
              ) : orders.map((order) => {
                return (
                  <tr key={order.id} className="border-b-2 border-[#1A1A1A]/10 hover:bg-[#00FFFF]/5 transition-colors group">
                    <td className="p-4 whitespace-nowrap font-bold">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-[#EC008C]" />
                        {formatManilaDateTime(order.created_at)}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="bg-[#1A1A1A] text-[#FFF200] px-2 py-0.5 font-bold tracking-tighter">
                        #{order.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>

                    <td className="p-4 font-black italic">
                      {getOrderTotalQuantity(order)} QTY
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
                      <div className="flex flex-col gap-1">
                        {order.fulfillment_mode === 'ADVANCE' ? (
                          <>
                            <span className="bg-[#FFF200] text-[#1A1A1A] px-2 py-0.5 text-[9px] font-black tracking-widest uppercase w-fit">
                              ADVANCE_ORDER
                            </span>
                            <span className="text-[9px] font-black uppercase opacity-70">
                              {formatManilaDateTime(order.expected_fulfillment_at)}
                            </span>
                          </>
                        ) : (
                          <span className="bg-[#1A1A1A] text-[#00FFFF] px-2 py-0.5 text-[9px] font-black tracking-widest uppercase w-fit">
                            NEED_NOW
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-black text-[#1A1A1A] text-sm">Tot: ₱{Number(order.total).toFixed(2)}</span>
                        <span className="font-mono text-[9px] uppercase text-[#EC008C] font-black tracking-widest">DP: ₱{Number(order.downpayment_amount || 0).toFixed(2)}</span>
                        <span className="text-[9px] opacity-70 uppercase flex items-center gap-1 font-bold">
                           <CreditCard size={8} /> Bal: ₱{Number(order.balance_amount || 0).toFixed(2)} ({order.payment_method})
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      {order.receipt_url ? (
                        <a href={order.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-[#1A1A1A] text-white px-2 py-1 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all font-black text-[9px] uppercase">
                          <Eye size={10} /> DP_Receipt
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#EC008C] font-black text-[9px] uppercase animate-pulse">
                          <AlertCircle size={10} /> Unpaid_DP
                        </span>
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
                      {order.status === 'CANCELLED' ? (
                        <div className="flex flex-col gap-2">
                          <span className="bg-[#EC008C] text-white px-2 py-1 text-[9px] font-black tracking-widest uppercase w-fit">
                            CANCELLED
                          </span>
                          <button
                            onClick={() => updateStatus(order.id, 'REFUNDED')}
                            className="bg-[#FFF200] text-[#1A1A1A] border-2 border-[#1A1A1A] px-3 py-2 font-black text-[9px] uppercase hover:bg-[#00FFFF] transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:shadow-none flex items-center gap-1 w-fit"
                          >
                            ✓ MARK AS REFUNDED
                          </button>
                        </div>
                      ) : order.status === 'REFUNDED' ? (
                        <div className="flex flex-col gap-2">
                          <span className="bg-[#00FFFF] text-[#1A1A1A] px-2 py-1 text-[9px] font-black tracking-widest uppercase w-fit">
                            ✓ REFUNDED
                          </span>
                          <span className="font-mono text-[8px] uppercase opacity-50">Awaiting customer confirmation</span>
                        </div>
                      ) : order.status === 'REFUND_CONFIRMED' ? (
                        <div className="flex flex-col gap-2">
                          <span className="bg-[#FFF200] text-[#1A1A1A] px-2 py-1 text-[9px] font-black tracking-widest uppercase w-fit">
                            ✓ REFUND CONFIRMED
                          </span>
                          <span className="font-mono text-[8px] uppercase opacity-50">Customer acknowledged</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
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
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-transform" />
                          </div>
                          {order.status === 'COMPLETED' && (
                            <span className="font-mono text-[8px] text-[#EC008C] font-black uppercase flex items-center gap-1">
                              ✓ FULLY_PAID
                            </span>
                          )}
                        </div>
                      )}
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
      </section>

      {/* ── MAP MODAL ── */}
      {viewMapOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#1A1A1A]/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-4 border-[#1A1A1A] p-6 shadow-[12px_12px_0px_0px_rgba(0,255,255,1)] max-w-2xl w-full relative">
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
    </main>
  );
}