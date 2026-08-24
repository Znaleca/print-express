"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart2,
  CheckCircle2,
  Clock,
  Layers3,
  PackageCheck,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  Zap,
} from "lucide-react";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
const REFUND_STATUSES = ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED"];
const ACTIVE_STATUSES = ["PENDING", "PLACED", "PREPARING", "READY_TO_PICK_UP", "RIDER_ON_THE_WAY"];
const READY_STATUSES = ["READY_TO_PICK_UP", "RIDER_ON_THE_WAY"];

const STATUS_LABELS = {
  PENDING: "Pending",
  PLACED: "Order placed",
  PREPARING: "In production",
  READY_TO_PICK_UP: "Ready for pickup",
  RIDER_ON_THE_WAY: "In delivery",
  DELIVERY_COMPLETED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
  REFUND_CONFIRMED: "Refund confirmed",
};

const formatCurrency = (value) => `₱${(Number(value) || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const getCompletionTimestamp = (order) => {
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const completionEvent = [...history]
    .reverse()
    .find((event) => COMPLETED_STATUSES.includes(event?.status));

  return completionEvent?.changed_at || order.updated_at || order.created_at;
};

const getStatusTone = (status) => {
  if (COMPLETED_STATUSES.includes(status)) return "bg-emerald-50 text-emerald-700";
  if (REFUND_STATUSES.includes(status)) return "bg-rose-50 text-rose-700";
  if (READY_STATUSES.includes(status)) return "bg-cyan-50 text-cyan-700";
  return "bg-amber-50 text-amber-700";
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-white shadow-xl">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-base font-extrabold text-[#00FFFF]">{formatCurrency(payload[0].value)}</p>
      <p className="mt-1 text-[10px] text-white/55">
        {payload[0].payload.orderCount} completed {payload[0].payload.orderCount === 1 ? "order" : "orders"}
      </p>
    </div>
  );
};

export default function OwnerOverviewPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [business, setBusiness] = useState(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("Daily");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, description, is_open")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz && !cancelled) {
        setBusiness(biz);

        const [{ count }, { data: ordersData }] = await Promise.all([
          supabase
            .from("services")
            .select("id", { count: "exact", head: true })
            .eq("business_id", biz.id)
            .eq("available", true),
          supabase
            .from("orders")
            .select("*")
            .eq("business_id", biz.id)
            .order("created_at", { ascending: false }),
        ]);

        if (!cancelled) {
          setServiceCount(count || 0);
          setOrders(ordersData || []);
        }
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const completedOrders = useMemo(
    () => orders.filter((order) => COMPLETED_STATUSES.includes(order.status)),
    [orders],
  );
  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.includes(order.status)),
    [orders],
  );
  const readyOrders = useMemo(
    () => orders.filter((order) => READY_STATUSES.includes(order.status)),
    [orders],
  );
  const refundOrders = useMemo(
    () => orders.filter((order) => REFUND_STATUSES.includes(order.status)),
    [orders],
  );
  const completedRevenue = useMemo(
    () => completedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    [completedOrders],
  );
  const refundValue = useMemo(
    () => refundOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    [refundOrders],
  );
  const averageCompletedOrder = completedOrders.length ? completedRevenue / completedOrders.length : 0;

  const stats = [
    {
      label: "Completed revenue",
      value: formatCurrency(completedRevenue),
      icon: TrendingUp,
      detail: `${completedOrders.length} completed ${completedOrders.length === 1 ? "order" : "orders"}`,
      tone: "text-emerald-700",
    },
    {
      label: "Active queue",
      value: activeOrders.length,
      icon: Zap,
      detail: `${readyOrders.length} ready for handoff`,
      tone: "text-cyan-700",
    },
    {
      label: "Average order",
      value: formatCurrency(averageCompletedOrder),
      icon: ShoppingBag,
      detail: "Completed orders only",
      tone: "text-slate-900",
    },
    {
      label: "Refunds & cancellations",
      value: refundOrders.length,
      icon: RefreshCcw,
      detail: `${formatCurrency(refundValue)} order value affected`,
      tone: "text-rose-700",
    },
    {
      label: "Active catalog",
      value: serviceCount,
      icon: Layers3,
      detail: "Products and services",
      tone: "text-[#EC008C]",
    },
  ];

  const chartData = useMemo(() => {
    const grouped = {};
    const limits = { Daily: 7, Weekly: 4, Monthly: 12, Yearly: 9999 };

    [...completedOrders]
      .sort((a, b) => new Date(getCompletionTimestamp(a)) - new Date(getCompletionTimestamp(b)))
      .forEach((order) => {
        const date = new Date(getCompletionTimestamp(order));
        if (Number.isNaN(date.getTime())) return;

        let key;
        if (timeframe === "Daily") {
          key = date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        } else if (timeframe === "Weekly") {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        } else if (timeframe === "Monthly") {
          key = date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        } else {
          key = String(date.getFullYear());
        }

        if (!grouped[key]) grouped[key] = { name: key, revenue: 0, orderCount: 0 };
        grouped[key].revenue += Number(order.total) || 0;
        grouped[key].orderCount += 1;
      });

    return Object.values(grouped).slice(-limits[timeframe]);
  }, [completedOrders, timeframe]);

  const bestSellers = useMemo(() => {
    const itemMap = {};

    completedOrders.forEach((order) => {
      if (!Array.isArray(order.items)) return;

      order.items.forEach((item) => {
        const title = item.title || item.name || "Custom print service";
        const quantity = Number(item.quantity) || 1;
        const grossValue = (Number(item.price) || 0) * quantity;

        if (!itemMap[title]) itemMap[title] = { title, qty: 0, grossValue: 0 };
        itemMap[title].qty += quantity;
        itemMap[title].grossValue += grossValue;
      });
    });

    return Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [completedOrders]);

  if (loading) return <OwnerPageSkeleton rows={4} />;

  return (
    <main data-tour="owner-dashboard" className="owner-overview-page min-h-screen bg-[#F6F6F2] pb-20 font-sans text-slate-900">
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-9 pt-8 text-white sm:px-8 sm:pb-11 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
              <span>Owner overview</span>
              <span className={`rounded-full px-2 py-1 tracking-normal ${business?.is_open === false ? "bg-white/10 text-white/55" : "bg-emerald-400/15 text-emerald-300"}`}>
                {business?.is_open === false ? "Closed" : "Open"}
              </span>
            </div>
            <h1 className="max-w-3xl truncate text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
              {business?.name || "My Print Shop"}
            </h1>
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">
              See what is earning, what needs action, and what customers are waiting for.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/owner/orders")}
              className="flex items-center gap-2 rounded-full bg-[#00FFFF] px-5 py-3 text-xs font-black text-[#1A1A1A] shadow-md transition-all hover:bg-[#FFF200]"
            >
              <ShoppingBag size={16} /> Manage orders
            </button>
            <button
              type="button"
              onClick={() => router.push("/owner/services")}
              className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-xs font-black text-white transition-all hover:bg-white/20"
            >
              <Layers3 size={16} /> Products & services
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 pt-8 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="relative flex min-h-[152px] flex-col justify-between overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm">
                <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{stat.label}</span>
                  <div className="rounded-2xl bg-[#1A1A1A] p-2 text-[#00FFFF]">
                    <Icon size={17} />
                  </div>
                </div>
                <div>
                  <p className={`truncate text-xl font-extrabold ${stat.tone}`}>{stat.value}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{stat.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Needs attention</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">Keep today’s queue moving</h2>
            </div>
            <button type="button" onClick={() => router.push("/owner/orders")} className="flex items-center gap-1 self-start text-xs font-black text-[#EC008C] hover:underline sm:self-auto">
              Open order management <ArrowRight size={14} />
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
              <div className="rounded-xl bg-rose-100 p-2 text-rose-700"><AlertTriangle size={18} /></div>
              <div>
                <p className="text-sm font-black text-rose-900">{refundOrders.length} refunds or cancellations</p>
                <p className="mt-0.5 text-[11px] text-rose-700/75">{formatCurrency(refundValue)} order value affected</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
              <div className="rounded-xl bg-cyan-100 p-2 text-cyan-700"><PackageCheck size={18} /></div>
              <div>
                <p className="text-sm font-black text-cyan-900">{readyOrders.length} ready for handoff</p>
                <p className="mt-0.5 text-[11px] text-cyan-700/75">Pickup and delivery handoffs</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock size={18} /></div>
              <div>
                <p className="text-sm font-black text-amber-900">{activeOrders.length} active orders</p>
                <p className="mt-0.5 text-[11px] text-amber-700/75">Orders still in the production queue</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#D8D6CE] bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black text-slate-900">Completed revenue</h2>
              <p className="text-xs text-slate-500">Completed order value grouped by completion date. Refunds and cancellations are excluded.</p>
            </div>
            <div className="flex gap-1.5 self-start rounded-2xl bg-[#ECECE8] p-1 sm:self-auto">
              {["Daily", "Weekly", "Monthly", "Yearly"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTimeframe(option)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${timeframe === option ? "bg-[#1A1A1A] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full min-w-0">
            {chartData.length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center text-center text-xs text-slate-400">
                <BarChart2 size={36} className="mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No completed sales data yet</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Earnings will plot here as orders are completed.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#64748B", fontSize: 11 }} tickFormatter={(value) => `₱${value}`} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#0F172A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="flex flex-col rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-slate-900"><Award size={18} className="text-[#EAB308]" /> Top completed items</h2>
                <p className="mt-1 text-[11px] text-slate-500">Ranked from completed orders only.</p>
              </div>
              <CheckCircle2 size={18} className="text-emerald-500" />
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2.5 font-semibold">Item</th>
                    <th className="px-2 py-2.5 font-semibold">Units</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Gross item value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {bestSellers.length === 0 ? (
                    <tr><td colSpan="3" className="py-8 text-center italic text-slate-400">No completed item sales yet.</td></tr>
                  ) : bestSellers.map((item) => (
                    <tr key={item.title} className="hover:bg-slate-50">
                      <td className="max-w-[180px] truncate px-2 py-3 font-bold text-slate-900">{item.title}</td>
                      <td className="px-2 py-3">{item.qty} pcs</td>
                      <td className="px-2 py-3 text-right font-bold text-emerald-600">{formatCurrency(item.grossValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-slate-900"><Clock size={18} className="text-[#EC008C]" /> Recent orders</h2>
                <p className="mt-1 text-[11px] text-slate-500">Latest activity across your shop.</p>
              </div>
              <button type="button" onClick={() => router.push("/owner/orders")} className="flex items-center gap-1 text-xs font-black text-[#EC008C] hover:underline">
                View all <ArrowRight size={12} />
              </button>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2.5 font-semibold">Order</th>
                    <th className="px-2 py-2.5 font-semibold">Date</th>
                    <th className="px-2 py-2.5 font-semibold">Total</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {orders.length === 0 ? (
                    <tr><td colSpan="4" className="py-8 text-center italic text-slate-400">No recent orders.</td></tr>
                  ) : orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-2 py-3 font-mono font-bold text-slate-900">#{order.id.split("-")[0].toUpperCase()}</td>
                      <td className="px-2 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</td>
                      <td className="px-2 py-3 font-bold text-slate-900">{formatCurrency(order.total)}</td>
                      <td className="px-2 py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${getStatusTone(order.status)}`}>
                          {STATUS_LABELS[order.status] || order.status?.replaceAll("_", " ") || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
