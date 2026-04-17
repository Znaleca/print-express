"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Activity,
  ArrowRight,
  CheckCircle,
  Clock,
  ShieldCheck,
  Star,
  TrendingUp,
  Zap,
  BarChart2,
  Award
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1A1A1A] border-2 border-[#00FFFF] p-3 shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]">
        <p className="font-mono text-[10px] uppercase text-[#FFF200] font-black tracking-widest mb-1">{label}</p>
        <p className="font-black italic text-lg text-white">
          ₱{Number(payload[0].value).toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

export default function OwnerOverviewPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [business, setBusiness] = useState(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("Daily"); // Daily, Weekly, Monthly, Yearly
  const chartContainerRef = useRef(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
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

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const measure = () => {
      if (!chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      setChartSize({
        width: width > 0 ? width : 0,
        height: height > 0 ? height : 0,
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const calculateRevenue = () => orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + Number(o.total), 0)
    .toFixed(2);

  const activeOrdersCount = orders.filter((o) => !["COMPLETED", "CANCELLED", "REFUNDED", "REFUND_CONFIRMED"].includes(o.status)).length;
  const cancelledOrdersCount = orders.filter((o) => ["CANCELLED", "REFUNDED", "REFUND_CONFIRMED"].includes(o.status)).length;

  const stats = [
    { label: "Net_Revenue", value: `₱${calculateRevenue()}`, icon: TrendingUp, detail: "All Time", tone: "bg-white border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]" },
    { label: "Active_Queue", value: activeOrdersCount, icon: Zap, detail: "Priority_High", tone: "bg-[#FFF200] border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]" },
    { label: "Node_Services", value: serviceCount, icon: Star, detail: "All_Systems_Nominal", tone: "bg-white border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(255,242,0,1)]" },
    { label: "Lost_Contracts", value: cancelledOrdersCount, icon: Activity, detail: "Cancels & Refunds", tone: "bg-[#1A1A1A] border-[#1A1A1A] text-[#EC008C] shadow-[8px_8px_0px_0px_rgba(236,0,140,0.5)]" },
  ];

  const chartData = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === "COMPLETED");
    if (completedOrders.length === 0) return [];
    
    const sorted = [...completedOrders].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const dataObj = {};
    
    sorted.forEach(order => {
      const date = new Date(order.created_at);
      let key;
      if (timeframe === "Daily") {
        key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (timeframe === "Weekly") {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        key = `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else if (timeframe === "Monthly") {
        key = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      } else if (timeframe === "Yearly") {
        key = date.getFullYear().toString();
      }
      
      if (!dataObj[key]) dataObj[key] = 0;
      dataObj[key] += Number(order.total);
    });

    const limitByTimeframe = {
      Daily: 7,
      Weekly: 4,
      Monthly: 12,
      Yearly: 9999,
    };

    return Object.entries(dataObj)
      .map(([name, Revenue]) => ({ name, Revenue }))
      .slice(-limitByTimeframe[timeframe]);
  }, [orders, timeframe]);

  const bestSellers = useMemo(() => {
    const itemMap = {};
    const validOrders = orders.filter(o => o.status !== "CANCELLED" && o.status !== "REFUNDED");
    
    validOrders.forEach(order => {
      if (!order.items || !Array.isArray(order.items)) return;
      order.items.forEach(item => {
        const title = item.title || item.name || "Unknown Asset";
        if (!itemMap[title]) itemMap[title] = { title, qty: 0, revenue: 0 };
        itemMap[title].qty += Number(item.quantity) || 1;
        itemMap[title].revenue += (Number(item.price || 0)) * (Number(item.quantity) || 1);
      });
    });
    
    return Object.values(itemMap).sort((a,b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center font-mono p-8 text-[#1A1A1A]">
        <Activity className="mb-4 animate-spin text-[#00FFFF]" size={48} />
        <p className="uppercase tracking-[0.35em] text-[10px] font-black animate-pulse">Syncing_Telemetry_Streams...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden pb-20">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-10 md:px-10 md:py-12">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Owner Dashboard // Print Production
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase italic tracking-tighter leading-[0.92]">
                Operations_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Console</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] md:text-sm uppercase tracking-[0.2em] leading-relaxed text-gray-600">
                Monitor {business?.name || "your shop"}, review active orders, and keep the production queue moving.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Status</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">System Online</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <ShieldCheck className="h-6 w-6 text-[#00FFFF]" />
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

      <section className="mx-auto w-full max-w-[1920px] px-6 py-10 md:px-10 md:py-14 space-y-12">
        {/* STATS */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className={`border-4 p-6 transition-all hover:-translate-y-1 hover:translate-x-1 flex flex-col justify-between h-44 ${s.tone}`}>
              <div className="flex items-start justify-between">
                <s.icon size={24} />
                <Activity size={14} className="opacity-30" />
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">{s.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black uppercase italic tracking-tighter leading-none">{s.value}</p>
                  <span className="font-mono text-[8px] tracking-tight opacity-60">{s.detail}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CHART SECTION */}
        <div className="bg-white border-4 border-[#1A1A1A] p-6 md:p-8 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(255,242,0,1)]">
          <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.18)_50%),linear-gradient(90deg,rgba(0,255,255,0.06),rgba(236,0,140,0.03),rgba(255,242,0,0.06))] bg-[length:100%_2px,3px_100%]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b-4 border-[#1A1A1A] pb-4">
            <div className="flex items-center gap-3">
              <BarChart2 className="text-[#00FFFF] bg-[#1A1A1A] p-1.5 w-10 h-10" />
              <div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Revenue Telemetry</h2>
                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-gray-500">Net revenue aggregates</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {["Daily", "Weekly", "Monthly", "Yearly"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-2 font-mono text-[10px] uppercase font-black uppercase tracking-widest border-2 transition-all ${
                    timeframe === tf 
                      ? "bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]" 
                      : "bg-white text-[#1A1A1A] border-[#1A1A1A] hover:bg-[#F9F9F7]"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div ref={chartContainerRef} className="relative h-72 md:h-96 w-full min-w-0 min-h-[18rem]">
            {chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center opacity-40">
                <BarChart2 size={48} className="mb-4" />
                <p className="font-black italic uppercase">No Revenue Data</p>
                <p className="font-mono text-[10px] uppercase mt-2">Awaiting completed order transactions</p>
              </div>
            ) : (
              <ResponsiveContainer
                width={chartSize.width > 0 ? "100%" : 320}
                height={chartSize.height > 0 ? "100%" : 280}
                minWidth={0}
                minHeight={280}
                debounce={100}
              >
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" opacity={0.1} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#1A1A1A', fontSize: 10, fontFamily: 'monospace' }} 
                    axisLine={{ stroke: '#1A1A1A', strokeWidth: 2 }}
                    tickLine={{ stroke: '#1A1A1A', strokeWidth: 2 }}
                  />
                  <YAxis 
                    tick={{ fill: '#1A1A1A', fontSize: 10, fontFamily: 'monospace' }} 
                    axisLine={{ stroke: '#1A1A1A', strokeWidth: 2 }}
                    tickLine={{ stroke: '#1A1A1A', strokeWidth: 2 }}
                    tickFormatter={(val) => `₱${val}`}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,255,255,0.1)' }} />
                  <Bar dataKey="Revenue" fill="#1A1A1A" stroke="#00FFFF" strokeWidth={2} activeBar={{ fill: '#EC008C', stroke: '#1A1A1A' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* TWO COLUMNS: BEST SELLERS & RECENT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* TOP ASSETS (Best Sellers) */}
          <div className="bg-white border-4 border-[#1A1A1A] p-6 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] flex flex-col h-full">
            <div className="relative flex flex-col gap-4 border-b-4 border-[#1A1A1A] pb-4 mb-6">
              <div className="flex items-center gap-3">
                <Award className="text-[#FFF200] bg-[#1A1A1A] p-1.5 w-10 h-10" />
                <div>
                  <h2 className="text-2xl font-black uppercase italic tracking-tighter">Top Assets</h2>
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-gray-500">Best selling prints by volume</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
                    {["Asset_Name", "Units_Sold", "Revenue"].map((h) => (
                      <th key={h} className="py-3 px-2 font-mono text-[9px] uppercase tracking-widest font-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {bestSellers.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="py-12 px-2 text-center italic uppercase tracking-widest text-[#1A1A1A]/40">No sales data acquired.</td>
                    </tr>
                  ) : bestSellers.map((item, idx) => (
                    <tr key={idx} className="border-b border-[#1A1A1A]/10 hover:bg-[#EC008C]/5 transition-colors">
                      <td className="py-4 px-2 font-black italic max-w-[150px] truncate" title={item.title}>
                        <span className="mr-2 text-[#EC008C]">#{idx + 1}</span> 
                        {item.title}
                      </td>
                      <td className="py-4 px-2 font-bold">{item.qty} PCS</td>
                      <td className="py-4 px-2 font-bold text-[#00FFFF] drop-shadow-[1px_1px_0_rgba(26,26,26,1)]">
                        ₱{item.revenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* LATEST ACQUISITIONS (Live Queue) */}
          <div className="bg-white border-4 border-[#1A1A1A] p-6 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] flex flex-col h-full">
            <div className="relative flex flex-col gap-4 border-b-4 border-[#1A1A1A] pb-4 md:flex-row md:items-center md:justify-between mb-6">
              <div className="flex items-center gap-3">
                <Clock className="text-[#EC008C] bg-[#1A1A1A] p-1.5 w-10 h-10" />
                <div>
                  <h2 className="text-2xl font-black uppercase italic tracking-tighter">Latest Acqs.</h2>
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-gray-500">Recent purchase ledger</p>
                </div>
              </div>

              <button
                onClick={() => router.push("/owner/orders")}
                className="group inline-flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-white transition-colors hover:bg-[#FFF200] hover:text-[#1A1A1A]"
              >
                All_Logs <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
                    {["ID", "Date", "Value", "Status"].map((h) => (
                      <th key={h} className="py-3 px-2 font-mono text-[9px] uppercase tracking-widest font-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-12 px-2 text-center italic uppercase tracking-widest text-[#1A1A1A]/40">No incoming data packets detected.</td>
                    </tr>
                  ) : orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="border-b border-[#1A1A1A]/10 transition-colors hover:bg-[#00FFFF]/5">
                      <td className="py-3 px-2">
                        <span className="bg-[#1A1A1A] px-1.5 py-0.5 font-bold text-[#FFF200] text-[10px]">{order.id.split("-")[0]}</span>
                      </td>
                      <td className="py-3 px-2 font-bold whitespace-nowrap">{new Date(order.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</td>
                      <td className="py-3 px-2">
                        <span className="font-black text-[#EC008C]">₱{Number(order.total).toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-2 right-align">
                        <div className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 font-black italic uppercase text-[9px] tracking-tight whitespace-nowrap ${order.status === "COMPLETED" ? "border-[#1A1A1A] bg-[#00FFFF] text-[#1A1A1A]" : "border-[#1A1A1A] bg-[#FFF200] text-[#1A1A1A]"}`}>
                          {order.status === "COMPLETED" ? <CheckCircle size={8} /> : <Activity size={8} className="animate-pulse" />}
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
      </section>
    </main>
  );
}