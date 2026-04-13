"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; // Added router for navigation
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart2, ShoppingBag, Star, TrendingUp,
  CheckCircle, Zap, Activity, ShieldCheck,
  ArrowUpRight, Clock, ChevronDown // Added ChevronDown here
} from "lucide-react";

export default function OwnerOverviewPage() {
  const router = useRouter(); // Initialize router
  const [orders, setOrders] = useState([]);
  const [business, setBusiness] = useState(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz, error: bizError } = await supabase
        .from("businesses")
        .select("id, name, description")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        setBusiness(biz);
        const { count } = await supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("business_id", biz.id)
          .eq("available", true);
        setServiceCount(count || 0);

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

  const calculateRevenue = () => {
    return orders
      .filter(o => o.status === "COMPLETED")
      .reduce((sum, o) => sum + Number(o.total), 0)
      .toFixed(2);
  };

  const activeOrdersCount = orders.filter(o => o.status !== "COMPLETED").length;

  const stats = [
    { label: "Net_Revenue", value: `₱${calculateRevenue()}`, icon: TrendingUp, detail: "+12.4% vs LY", color: "border-[#FF3E00] text-[#FF3E00]" },
    { label: "Active_Queue", value: activeOrdersCount, icon: Zap, detail: "Priority_High", color: "border-black text-black bg-[#FFF200]" },
    { label: "Node_Services", value: serviceCount, icon: Star, detail: "All_Systems_Nominal", color: "border-black text-black" },
    { label: "System_Load", value: "OPTIMAL", icon: Activity, detail: "98.2% Uptime", color: "border-black text-black" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F4F1] flex flex-col items-center justify-center font-mono p-8">
        <Activity className="animate-spin mb-4 text-[#FF3E00]" size={48} />
        <p className="uppercase tracking-[0.3em] text-xs animate-pulse">Syncing_Telemetry_Streams...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F1] p-4 lg:p-8 font-sans text-black">
      {/* ── HEADER ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 border-b-4 border-black pb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-black flex items-center justify-center text-[#FFF200]">
              <ShieldCheck size={20} />
            </div>
            <span className="font-mono text-[10px] tracking-widest uppercase opacity-60">Auth_Secure // Node_Owner</span>
          </div>
          <h1 className="text-5xl font-black uppercase italic leading-none tracking-tighter">
            Operations_<span className="text-[#FF3E00]">Console</span>
          </h1>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest max-w-md opacity-70">
            Real-time monitoring of {business?.name || "unnamed_node"} output streams and revenue metrics.
          </p>
        </div>

        <div className="flex flex-col items-end">
          <div className="bg-black text-white px-4 py-2 font-mono text-[10px] uppercase tracking-tighter mb-2">
            Status: <span className="text-[#00FF41] animate-pulse">Online</span>
          </div>
          <div className="text-right font-mono text-[10px] uppercase opacity-50">
            Sector_Time: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed top-8 right-8 z-50 bg-[#FF3E00] text-white p-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle size={18} />
          <span className="font-mono text-xs uppercase font-bold tracking-widest">{toast.msg}</span>
        </div>
      )}

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`border-2 p-6 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between h-40 ${s.color}`}>
            <div className="flex justify-between items-start">
              <s.icon size={24} />
              <ArrowUpRight size={16} className="opacity-30" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest font-bold mb-1 opacity-70">{s.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black italic uppercase tracking-tighter leading-none">{s.value}</p>
                <span className="font-mono text-[8px] tracking-tighter opacity-60">{s.detail}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── RECENT ORDERS ── */}
      <div className="mt-12 bg-white border-4 border-black p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b-2 border-black/10 pb-4">
          <div className="flex items-center gap-3">
            <Clock className="text-[#FF3E00]" size={20} />
            <h2 className="text-2xl font-black uppercase italic tracking-tighter">Live_Telemetry_Stream</h2>
          </div>
          <button
            onClick={() => router.push("/owner/orders")}
            className="group flex items-center gap-2 bg-black text-white px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-[#FF3E00] transition-colors"
          >
            Access_Full_Logs <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                {["Timestamp", "Operation_ID", "Asset_Vol", "Value", "Status"].map((h) => (
                  <th key={h} className="py-4 font-mono text-[10px] uppercase tracking-widest font-black opacity-40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-black/40 italic uppercase tracking-widest">No incoming data packets detected.</td>
                </tr>
              ) : orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="border-b border-black/5 hover:bg-[#F4F4F1] transition-colors group">
                  <td className="py-4 font-bold">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="py-4">
                    <span className="bg-black text-[#FFF200] px-2 py-0.5 font-bold">
                      {order.id.split('-')[0]}
                    </span>
                  </td>
                  <td className="py-4 font-black italic">
                    {order.items?.length || 0} PCS
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col">
                      <span className="font-black text-[#FF3E00]">₱{Number(order.total).toFixed(2)}</span>
                      <span className="text-[9px] opacity-50 italic">{order.payment_method}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 border-2 font-black italic uppercase text-[10px] tracking-tight ${order.status === 'COMPLETED'
                        ? 'border-[#FF3E00] bg-[#FF3E00] text-white'
                        : 'border-black bg-black text-[#FFF200]'
                      }`}>
                      {order.status === 'COMPLETED' ? <CheckCircle size={10} /> : <Activity size={10} className="animate-pulse" />}
                      {order.status}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}