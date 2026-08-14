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
  Award,
  ShoppingBag
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-white">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="font-extrabold text-base text-[#00FFFF]">
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
  const [timeframe, setTimeframe] = useState("Daily");
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
    { label: "Total Revenue", value: `₱${calculateRevenue()}`, icon: TrendingUp, detail: "All-time completed jobs" },
    { label: "Active Orders", value: activeOrdersCount, icon: Zap, detail: "Pending production" },
    { label: "Services Offered", value: serviceCount, icon: Star, detail: "Active catalog items" },
    { label: "Cancellations & Refunds", value: cancelledOrdersCount, icon: Activity, detail: "Cancelled orders" },
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
        const title = item.title || item.name || "Custom Print Service";
        if (!itemMap[title]) itemMap[title] = { title, qty: 0, revenue: 0 };
        itemMap[title].qty += Number(item.quantity) || 1;
        itemMap[title].revenue += (Number(item.price || 0)) * (Number(item.quantity) || 1);
      });
    });
    
    return Object.values(itemMap).sort((a,b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-8 text-slate-600">
        <Activity className="mb-3 animate-spin text-[#EC008C]" size={36} />
        <p className="text-xs font-semibold uppercase tracking-wider">Loading dashboard metrics...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden pb-20">
      
      {/* Header Banner */}
      <section className="bg-white border-b border-slate-200 py-5 px-4 sm:px-6 lg:px-8 relative shadow-sm">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold mb-2">
              <ShieldCheck size={14} className="text-[#00E5FF]" /> Shop Owner Dashboard
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {business?.name || "My Print Shop"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Executive summary of sales revenue, active order queue, and best-selling items.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/owner/orders")}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-all shadow-sm flex items-center gap-2"
            >
              <ShoppingBag size={16} /> Manage Orders
            </button>
          </div>
        </div>
      </section>

      {/* Main Metrics & Content */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-6">
        
        {/* STATS CARDS */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />
              <div className="flex items-start justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                  <s.icon size={18} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* REVENUE RECHARTS CHART */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Revenue Analytics</h2>
              <p className="text-xs text-slate-500">Track earnings from completed print jobs over time.</p>
            </div>

            <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
              {["Daily", "Weekly", "Monthly", "Yearly"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeframe === tf
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div ref={chartContainerRef} className="h-72 w-full">
            {chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center text-xs text-slate-400">
                <BarChart2 size={36} className="mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No Completed Sales Data Yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Earnings will plot here as orders are completed.</p>
              </div>
            ) : (
              <ResponsiveContainer
                width={chartSize.width > 0 ? "100%" : 320}
                height={chartSize.height > 0 ? "100%" : 280}
              >
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(val) => `₱${val}`} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="Revenue" fill="#0F172A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* BEST SELLERS & RECENT ORDERS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* BEST SELLERS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
            <h2 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Award size={18} className="text-[#EAB308]" /> Best Selling Services & Products
            </h2>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 px-2">Item</th>
                    <th className="py-2.5 px-2">Units Sold</th>
                    <th className="py-2.5 px-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {bestSellers.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="py-8 text-center text-slate-400 italic">No sales recorded yet.</td>
                    </tr>
                  ) : bestSellers.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-2 font-bold text-slate-900 truncate max-w-[160px]">{item.title}</td>
                      <td className="py-3 px-2">{item.qty} pcs</td>
                      <td className="py-3 px-2 text-right font-bold text-emerald-600">₱{item.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RECENT ORDERS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock size={18} className="text-[#EC008C]" /> Recent Orders
              </h2>
              <button
                onClick={() => router.push("/owner/orders")}
                className="text-xs font-bold text-[#EC008C] hover:underline flex items-center gap-1"
              >
                View All <ArrowRight size={12} />
              </button>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 px-2">Order ID</th>
                    <th className="py-2.5 px-2">Date</th>
                    <th className="py-2.5 px-2">Total</th>
                    <th className="py-2.5 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-slate-400 italic">No recent orders.</td>
                    </tr>
                  ) : orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="py-3 px-2 font-mono font-bold text-slate-900">#{order.id.split("-")[0].toUpperCase()}</td>
                      <td className="py-3 px-2 text-slate-500">{new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                      <td className="py-3 px-2 font-bold text-slate-900">₱{Number(order.total).toFixed(2)}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          order.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {order.status}
                        </span>
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