"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Layers3,
  MessageCircle,
  PackageCheck,
  RefreshCcw,
  ShoppingBag,
  Star,
  Store,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import { supabase } from "@/lib/supabaseClient";

const RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];
const SALES_PERIOD_OPTIONS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const STATUS_COLORS = ["#00AEB5", "#EC008C", "#EAB308", "#1A1A1A", "#64748B", "#00A878"];
const FULFILLMENT_COLORS = ["#00AEB5", "#EC008C"];
const RATING_COLORS = ["#00A878", "#00AEB5", "#EAB308", "#F97316", "#EC008C"];

const formatCurrency = (value) => `₱${(Number(value) || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatDateTime = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatDate = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const shortId = (value) => `#${String(value || "").split("-")[0].toUpperCase()}`;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white shadow-xl">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="mt-1 text-xs font-bold" style={{ color: item.color || "#fff" }}>
          {item.name || item.dataKey}: {item.dataKey === "revenue" || item.dataKey === "downpayments" || item.dataKey === "sales" ? formatCurrency(item.value) : item.value}
        </p>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-xs font-semibold text-slate-400">{message}</div>;
}

function SectionHeading({ eyebrow, title, href, linkLabel = "View all", headingId }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        {eyebrow && <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">{eyebrow}</p>}
        <h2 id={headingId} className="mt-1 text-base font-black text-slate-900">{title}</h2>
      </div>
      {href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-[#008F91] hover:text-[#EC008C] hover:underline">{linkLabel} <ArrowRight size={13} /></Link>}
    </div>
  );
}

function MetricCard({ href, label, value, detail, icon: Icon, tone = "text-slate-900" }) {
  const content = (
    <div className="flex h-full min-h-28 flex-col justify-between gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-500">{label}</span>
        <Icon size={17} className="shrink-0 text-[#008F91]" aria-hidden="true" />
      </div>
      <div>
        <p className={`truncate text-2xl font-black ${tone}`}>{value}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{detail}</p>
      </div>
    </div>
  );

  return href ? <Link href={href} className="group relative overflow-hidden border border-[#D8D6CE] bg-white transition-colors hover:border-[#00AEB5] focus:outline-none focus:ring-2 focus:ring-[#00AEB5]">{content}</Link> : <div className="relative overflow-hidden border border-[#D8D6CE] bg-white">{content}</div>;
}

function RankedItems({ items, label, kind }) {
  const Icon = kind === "product" ? ShoppingBag : Layers3;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        <Icon size={14} className={kind === "product" ? "text-[#008F91]" : "text-[#EC008C]"} aria-hidden="true" />
        {label}
      </div>
      {items.length ? (
        <ol className="divide-y divide-slate-100" aria-label={`Top three ${label.toLowerCase()}`}>
          {items.map((item, index) => (
            <li key={item.name} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-[#F6F6F2] text-[10px] font-black text-slate-500">{index + 1}</span>
                <span className="truncate text-xs font-bold text-slate-800">{item.name}</span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-black text-slate-900">{item.quantity} sold</p>
                <p className="text-[10px] text-emerald-700">{formatCurrency(item.revenue)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="py-5 text-xs font-semibold text-slate-400">No {label.toLowerCase()} sold yet.</p>}
    </div>
  );
}

function ActionItem({ item }) {
  const tone = item.tone === "magenta"
    ? "border-[#EC008C]/35 bg-[#EC008C]/5"
    : item.tone === "cyan"
      ? "border-[#00AEB5]/35 bg-[#00AEB5]/5"
      : "border-[#D1C500]/45 bg-[#FFF200]/10";
  return (
    <Link href={item.href} className={`group flex items-center justify-between gap-3 border-l-4 p-3 transition-colors hover:bg-white ${tone}`}>
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-slate-900">{item.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.detail}</p>
      </div>
      <ArrowRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-900" aria-hidden="true" />
    </Link>
  );
}

export default function OwnerOverviewPage() {
  const [dashboard, setDashboard] = useState(null);
  const [range, setRange] = useState("30d");
  const [salesPeriod, setSalesPeriod] = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const requestDashboard = useCallback(async (signal) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your owner session has expired. Please sign in again.");

    const response = await fetch(`/api/owner/dashboard?range=${encodeURIComponent(range)}&salesPeriod=${encodeURIComponent(salesPeriod)}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.error === "OWNER_DASHBOARD_UNAVAILABLE") throw new Error("Dashboard data is temporarily unavailable. Please retry.");
      if (payload.error === "Forbidden") throw new Error("This page is available to business owners only.");
      throw new Error(payload.error || "Could not load the owner dashboard.");
    }
    return payload;
  }, [range, salesPeriod]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");

    requestDashboard(controller.signal)
      .then((payload) => {
        if (!active) return;
        setDashboard(payload);
        setLastUpdated(payload?._meta?.generatedAt || new Date().toISOString());
      })
      .catch((loadError) => {
        if (active && loadError.name !== "AbortError") setError(loadError.message || "Could not load the owner dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestDashboard]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const payload = await requestDashboard();
      setDashboard(payload);
      setLastUpdated(payload?._meta?.generatedAt || new Date().toISOString());
    } catch (refreshError) {
      if (refreshError.name !== "AbortError") setError(refreshError.message || "Could not refresh the owner dashboard.");
    } finally {
      setRefreshing(false);
    }
  };

  const orderTrend = dashboard?.orderTrend || [];
  const salesTrend = dashboard?.salesTrend || dashboard?.weeklySales || [];
  const statusBreakdown = dashboard?.statusBreakdown || [];
  const fulfillmentBreakdown = dashboard?.fulfillmentBreakdown || [];
  const ratingDistribution = dashboard?.ratingDistribution || [];
  const kpis = dashboard?.kpis || {};
  const actionItems = dashboard?.actionItems || [];
  const hasTrendData = orderTrend.some((entry) => entry.orders > 0 || entry.revenue > 0 || entry.downpayments > 0);
  const salesPeriodLabel = SALES_PERIOD_OPTIONS.find((option) => option.key === salesPeriod)?.label || "Weekly";
  const salesTotal = useMemo(() => salesTrend.reduce((sum, item) => sum + Number(item.sales || 0), 0), [salesTrend]);
  const statusTotal = useMemo(() => statusBreakdown.reduce((sum, item) => sum + Number(item.count || 0), 0), [statusBreakdown]);
  const fulfillmentTotal = useMemo(() => fulfillmentBreakdown.reduce((sum, item) => sum + Number(item.count || 0), 0), [fulfillmentBreakdown]);
  const ratingTotal = useMemo(() => ratingDistribution.reduce((sum, item) => sum + Number(item.count || 0), 0), [ratingDistribution]);

  if (loading && !dashboard) return <OwnerPageSkeleton rows={5} />;

  if (!dashboard?.business && !error) {
    return <main className="min-h-screen bg-[#F6F6F2] p-6 text-sm font-semibold text-slate-600">No shop is linked to this owner account yet.</main>;
  }

  const business = dashboard?.business;
  const rangeLabel = RANGE_OPTIONS.find((option) => option.key === range)?.label || "30 days";

  return (
    <main data-tour="owner-dashboard" className="owner-overview-page min-h-screen bg-[#F6F6F2] pb-12 font-sans text-slate-900">
      <header className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-6 pt-7 text-white sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
              <span>Owner dashboard</span>
              <span className={`rounded-full px-2 py-1 tracking-normal ${business?.is_open === false ? "bg-white/10 text-white/55" : "bg-emerald-400/15 text-emerald-300"}`}>
                {business?.is_open === false ? "Closed" : "Open"}
              </span>
              {business?.lifecycle_state && business.lifecycle_state !== "ACTIVE" && <span className="rounded-full bg-rose-400/15 px-2 py-1 tracking-normal text-rose-300">{business.lifecycle_state}</span>}
            </div>
            <h1 className="mt-2 truncate text-3xl font-black uppercase leading-none tracking-tight sm:text-5xl">{business?.name || "My print shop"}</h1>
            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-white/65">{business?.description || "Run the queue, follow customer activity, and keep your shop ready for its next order."}</p>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 border border-white/15 bg-white/5 p-1" role="group" aria-label="Dashboard date range">
                {RANGE_OPTIONS.map((option) => <button key={option.key} type="button" onClick={() => setRange(option.key)} className={`px-3 py-2 text-[11px] font-black transition-colors ${range === option.key ? "bg-[#00FFFF] text-[#1A1A1A]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>{option.label}</button>)}
              </div>
              <button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 border border-white/25 px-3 py-2 text-[11px] font-black text-white transition-colors hover:border-[#00FFFF] hover:text-[#00FFFF] disabled:cursor-wait disabled:opacity-50">
                <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="text-[10px] text-white/45">Showing {rangeLabel.toLowerCase()} · Updated {lastUpdated ? formatDateTime(lastUpdated) : "just now"}</p>
          </div>
        </div>
      </header>

      <section className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-[#EC008C] bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800"><span className="flex items-center gap-2"><AlertTriangle size={15} /> {error}</span><button type="button" onClick={handleRefresh} disabled={refreshing} className="bg-white px-3 py-1.5 font-black text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50">Retry</button></div>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <MetricCard href="/owner/orders" label="New orders" value={kpis.newOrders ?? 0} detail="Waiting for review" icon={ShoppingBag} tone="text-[#756D00]" />
          <MetricCard href="/owner/orders" label="In production" value={kpis.inProduction ?? 0} detail="Currently being made" icon={Wrench} tone="text-[#008F91]" />
          <MetricCard href="/owner/orders" label="Ready" value={kpis.readyOrders ?? 0} detail="Pickup or delivery" icon={PackageCheck} tone="text-[#008F91]" />
          <MetricCard href="/owner/orders" label="Completed" value={kpis.completedOrders ?? 0} detail={`${rangeLabel} orders`} icon={CheckCircle2} tone="text-emerald-700" />
          <MetricCard href="/owner/orders" label="Revenue" value={formatCurrency(kpis.revenue)} detail="Completed order value" icon={BarChart3} tone="text-slate-900" />
          <MetricCard href="/owner/orders" label="Downpayments" value={formatCurrency(kpis.downpayments)} detail="Recorded in this range" icon={Activity} tone="text-emerald-700" />
          <MetricCard href="/owner/orders" label="Outstanding" value={formatCurrency(kpis.outstanding)} detail="Open order balances" icon={Clock3} tone="text-[#EC008C]" />
          <MetricCard href="/owner/messages" label="Unread messages" value={kpis.unreadMessages ?? 0} detail="Customer replies needed" icon={MessageCircle} tone="text-[#EC008C]" />
        </div>

        <div className="grid grid-cols-2 gap-3 border-y border-[#D8D6CE] bg-white px-4 py-3 sm:grid-cols-4">
          <Link href="/owner/calendar" className="flex items-center gap-2 text-xs hover:text-[#EC008C]"><CalendarDays size={15} className="text-[#008F91]" /><span><strong>{kpis.upcomingMeetings ?? 0}</strong> upcoming meetings</span></Link>
          <Link href="/owner/reviews" className="flex items-center gap-2 text-xs hover:text-[#EC008C]"><Star size={15} className="fill-[#FFF200] text-[#756D00]" /><span><strong>{kpis.averageRating == null ? "—" : Number(kpis.averageRating).toFixed(1)}</strong> average rating</span></Link>
          <Link href="/owner/services" className="flex items-center gap-2 text-xs hover:text-[#EC008C]"><Layers3 size={15} className="text-[#EC008C]" /><span><strong>{kpis.activeServices ?? 0}</strong> active services</span></Link>
          <Link href="/owner/services" className="flex items-center gap-2 text-xs hover:text-[#EC008C]"><AlertTriangle size={15} className="text-[#756D00]" /><span><strong>{kpis.lowStockServices ?? 0}</strong> low-stock products</span></Link>
        </div>

        <section className="border border-[#D8D6CE] bg-white p-4 sm:p-5" aria-labelledby="owner-action-center">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Action center</p><h2 id="owner-action-center" className="mt-1 text-xl font-black">What needs your attention</h2></div>
            <p className="text-[11px] text-slate-500">These links clear as the underlying records are resolved.</p>
          </div>
          {actionItems.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{actionItems.map((item) => <ActionItem key={item.key} item={item} />)}</div> : <div className="flex items-center gap-3 py-6 text-sm font-bold text-emerald-700"><CheckCircle2 size={20} /> You&apos;re all caught up. There are no urgent owner actions right now.</div>}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <section className="min-w-0 border border-[#D8D6CE] bg-white p-4 sm:p-5" aria-labelledby="orders-trend-heading">
            <SectionHeading eyebrow="Analytics" title="Orders and money over time" headingId="orders-trend-heading" />
            <p className="mt-2 text-[11px] text-slate-500">Orders are grouped by creation date. Revenue counts completed orders; downpayments count recorded receipts.</p>
            <div className="mt-4 h-72 w-full min-w-0" aria-label="Orders, revenue, and downpayments over time">
              {!hasTrendData ? <EmptyState message="No order activity in this date range yet." /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><LineChart data={orderTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} minTickGap={18} /><YAxis yAxisId="currency" tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={(value) => `₱${value}`} /><YAxis yAxisId="orders" orientation="right" tick={{ fill: "#64748B", fontSize: 10 }} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line yAxisId="currency" type="monotone" dataKey="revenue" name="Revenue" stroke="#1A1A1A" strokeWidth={2} dot={{ r: 2 }} /><Line yAxisId="currency" type="monotone" dataKey="downpayments" name="Downpayments" stroke="#00AEB5" strokeWidth={2} dot={{ r: 2 }} /><Line yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#EC008C" strokeWidth={2} dot={{ r: 2 }} /></LineChart></ResponsiveContainer>}
            </div>
            <p className="sr-only">This chart contains {orderTrend.length} time periods. {kpis.totalOrders ?? 0} orders are in the selected range, with {formatCurrency(kpis.revenue)} in completed order value.</p>
          </section>

          <section className="min-w-0 border border-[#D8D6CE] bg-white p-4 sm:p-5" aria-labelledby="status-heading">
            <SectionHeading eyebrow="Queue mix" title="Orders by status" href="/owner/orders" headingId="status-heading" />
            <div className="mt-4 h-64 w-full min-w-0" aria-label="Orders grouped by status">
              {!statusTotal ? <EmptyState message="No orders in this date range." /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={statusBreakdown} layout="vertical" margin={{ top: 0, right: 8, left: 10, bottom: 0 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#64748B", fontSize: 10 }} /><YAxis dataKey="label" type="category" width={95} tick={{ fill: "#475569", fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" name="Orders" radius={[0, 4, 4, 0]}>{statusBreakdown.map((entry, index) => <Cell key={entry.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>}
            </div>
            <p className="text-[11px] text-slate-500">{statusTotal} total orders represented in this range.</p>
          </section>
        </div>

        <section className="border border-[#D8D6CE] bg-white p-4 sm:p-5" aria-labelledby="sales-heading">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Sales rhythm</p>
              <h2 id="sales-heading" className="mt-1 text-base font-black text-slate-900">Sales</h2>
            </div>
            <div className="flex items-center gap-1 self-start border border-slate-200 bg-[#F6F6F2] p-1 sm:self-auto" role="group" aria-label="Sales period">
              {SALES_PERIOD_OPTIONS.map((option) => <button key={option.key} type="button" aria-pressed={salesPeriod === option.key} onClick={() => setSalesPeriod(option.key)} className={`px-3 py-2 text-[11px] font-black transition-colors ${salesPeriod === option.key ? "bg-[#1A1A1A] text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}>{option.label}</button>)}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Completed order value grouped by {salesPeriodLabel.toLowerCase()}, using the selected date range.</p>
          <div className="mt-4 h-60 w-full min-w-0" aria-label={`Completed sales by ${salesPeriodLabel.toLowerCase()}`}>
            {!salesTrend.length ? <EmptyState message={`No completed sales in this ${salesPeriodLabel.toLowerCase()} range yet.`} /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={salesTrend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} minTickGap={18} /><YAxis tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={(value) => `₱${value}`} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="sales" name="Completed sales" fill="#00AEB5" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
          </div>
          <p className="sr-only">{salesPeriodLabel} sales total {formatCurrency(salesTotal)} across {salesTrend.length} {salesPeriod === "daily" ? "days" : salesPeriod === "monthly" ? "months" : "weeks"} in the selected range.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="min-w-0 border border-[#D8D6CE] bg-white p-4" aria-labelledby="fulfillment-heading">
            <SectionHeading eyebrow="Fulfillment" title="Pickup versus delivery" headingId="fulfillment-heading" />
            <div className="mt-3 h-48 w-full min-w-0" aria-label="Pickup and delivery order mix">
              {!fulfillmentTotal ? <EmptyState message="No fulfillment data yet." /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie data={fulfillmentBreakdown} dataKey="count" nameKey="label" innerRadius="52%" outerRadius="78%" paddingAngle={3}>{fulfillmentBreakdown.map((entry, index) => <Cell key={entry.type} fill={FULFILLMENT_COLORS[index % FULFILLMENT_COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer>}
            </div>
            <p className="text-[11px] text-slate-500">{fulfillmentTotal} orders with a fulfillment method.</p>
          </section>

          <section className="min-w-0 border border-[#D8D6CE] bg-white p-4" aria-labelledby="rating-heading">
            <SectionHeading eyebrow="Customer feedback" title="Rating distribution" href="/owner/reviews" headingId="rating-heading" />
            <div className="mt-3 h-48 w-full min-w-0" aria-label="Customer rating distribution">
              {!ratingTotal ? <EmptyState message="No customer reviews yet." /> : <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={ratingDistribution} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" /><XAxis dataKey="rating" tickFormatter={(value) => `${value}★`} tick={{ fill: "#64748B", fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" name="Reviews" radius={[4, 4, 0, 0]}>{ratingDistribution.map((entry, index) => <Cell key={entry.rating} fill={RATING_COLORS[index % RATING_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>}
            </div>
            <p className="text-[11px] text-slate-500">{ratingTotal} visible customer {ratingTotal === 1 ? "review" : "reviews"} in this range.</p>
          </section>

          <section className="min-w-0 border border-[#D8D6CE] bg-white p-4" aria-labelledby="top-services-heading">
            <SectionHeading eyebrow="Catalog performance" title="Top 3 services & products" href="/owner/services" headingId="top-services-heading" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <RankedItems items={dashboard?.topServices || []} label="Services" kind="service" />
              <RankedItems items={dashboard?.topProducts || []} label="Products" kind="product" />
            </div>
          </section>
        </div>

        <section aria-labelledby="recent-activity-heading">
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Recent activity</p><h2 id="recent-activity-heading" className="mt-1 text-xl font-black">Stay close to the shop floor</h2></div><span className="text-[11px] text-slate-500">Latest five records per list</span></div>
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <section className="min-w-0 border border-[#D8D6CE] bg-white p-4" aria-labelledby="recent-orders-heading">
              <SectionHeading title="Recent orders" href="/owner/orders" headingId="recent-orders-heading" />
              {dashboard?.recentOrders?.length ? <div className="mt-2 divide-y divide-slate-100">{dashboard.recentOrders.map((order) => <Link href="/owner/orders" key={order.id} className="flex items-center justify-between gap-3 py-3 hover:bg-[#F6F6F2]"><div className="min-w-0"><p className="text-xs font-black text-slate-900">{shortId(order.id)}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(order.createdAt)} · {order.deliveryType === "DELIVERY" ? "Delivery" : "Pickup"}</p></div><div className="shrink-0 text-right"><p className="text-xs font-black text-slate-900">{formatCurrency(order.total)}</p><span className="mt-1 inline-flex bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{order.statusLabel}</span></div></Link>)}</div> : <EmptyState message="No recent orders." />}
            </section>

            <div className="space-y-5">
              <section className="border border-[#D8D6CE] bg-white p-4" aria-labelledby="messages-heading">
                <SectionHeading title="Customer messages" href="/owner/messages" headingId="messages-heading" />
                {dashboard?.recentMessages?.length ? <div className="mt-2 divide-y divide-slate-100">{dashboard.recentMessages.map((message) => <Link href="/owner/messages" key={message.conversationId} className="flex items-center justify-between gap-3 py-3 hover:bg-[#F6F6F2]"><div className="flex min-w-0 items-center gap-2"><MessageCircle size={15} className="shrink-0 text-[#EC008C]" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{message.customerName}</p><p className="mt-1 text-[10px] text-slate-500">{message.messageType === "text" ? "Customer message" : "Conversation update"} · {formatDateTime(message.createdAt)}</p></div></div>{message.unread && <span className="shrink-0 bg-[#EC008C] px-2 py-1 text-[9px] font-black text-white">Unread</span>}</Link>)}</div> : <EmptyState message="No customer messages yet." />}
              </section>

              <section className="border border-[#D8D6CE] bg-white p-4" aria-labelledby="meetings-heading">
                <SectionHeading title="Upcoming meetings" href="/owner/calendar" headingId="meetings-heading" />
                {dashboard?.upcomingMeetingList?.length ? <div className="mt-2 divide-y divide-slate-100">{dashboard.upcomingMeetingList.map((meeting) => <Link href="/owner/calendar" key={meeting.id} className="flex items-center justify-between gap-3 py-3 hover:bg-[#F6F6F2]"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{meeting.customerName}</p><p className="mt-1 text-[10px] text-slate-500">{meeting.status === "REQUESTED" ? "Needs response" : meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : "Time to be confirmed"}</p></div><CalendarDays size={15} className="shrink-0 text-[#008F91]" /></Link>)}</div> : <EmptyState message="No upcoming meetings." />}
              </section>
            </div>

            <div className="space-y-5">
              <section className="border border-[#D8D6CE] bg-white p-4" aria-labelledby="reviews-heading">
                <SectionHeading title="Recent reviews" href="/owner/reviews" headingId="reviews-heading" />
                {dashboard?.recentReviews?.length ? <div className="mt-2 divide-y divide-slate-100">{dashboard.recentReviews.map((review) => <Link href="/owner/reviews" key={review.orderId} className="flex items-center justify-between gap-3 py-3 hover:bg-[#F6F6F2]"><div><p className="text-xs font-bold text-slate-800">Order {shortId(review.orderId)}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(review.createdAt)}</p></div><span className="inline-flex items-center gap-1 text-xs font-black text-[#756D00]"><Star size={13} className="fill-[#FFF200]" /> {review.rating}.0</span></Link>)}</div> : <EmptyState message="No reviews yet." />}
              </section>

              <section className="border border-[#D8D6CE] bg-white p-4" aria-labelledby="payments-heading">
                <SectionHeading title="Recent payment activity" href="/owner/orders" headingId="payments-heading" />
                {dashboard?.recentPayments?.length ? <div className="mt-2 divide-y divide-slate-100">{dashboard.recentPayments.map((payment) => <Link href="/owner/orders" key={payment.id} className="flex items-center justify-between gap-3 py-3 hover:bg-[#F6F6F2]"><div><p className="text-xs font-bold text-slate-800">Order {shortId(payment.id)}</p><p className="mt-1 text-[10px] text-slate-500">{payment.label} · {payment.method || "Payment"} · {formatDate(payment.createdAt)}</p></div><span className="shrink-0 text-xs font-black text-emerald-700">{formatCurrency(payment.amount)}</span></Link>)}</div> : <EmptyState message="No payment activity yet." />}
              </section>
            </div>
          </div>
        </section>

        <section className="border border-[#D8D6CE] bg-[#1A1A1A] p-4 text-white sm:p-5" aria-labelledby="quick-actions-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#00FFFF]">Quick actions</p><h2 id="quick-actions-heading" className="mt-1 text-lg font-black">Jump back into your workspace</h2></div><Store size={20} className="text-[#FFF200]" aria-hidden="true" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["/owner/orders", "View orders", ShoppingBag],
              ["/owner/services", "Edit services", Layers3],
              ["/owner/messages", "Open messages", MessageCircle],
              ["/owner/calendar", "View calendar", CalendarDays],
              ["/owner/shop", "Edit shop", Store],
              ["/owner/documents", "Review documents", FileText],
              ["/owner/reviews", "View reviews", Star],
            ].map(([href, label, Icon]) => <Link key={href} href={href} className="inline-flex items-center justify-center gap-2 border border-white/15 px-3 py-2.5 text-[10px] font-black text-white/80 transition-colors hover:border-[#00FFFF] hover:bg-white/10 hover:text-[#00FFFF]"><Icon size={14} /> {label}</Link>)}
          </div>
        </section>
      </section>
    </main>
  );
}
