"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
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

const RANGE_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

const STATUS_COLORS = {
  APPROVED: "#00A878",
  PENDING: "#D1C500",
  REJECTED: "#EC008C",
  CANCELLED: "#64748B",
  REFUND_PENDING: "#F97316",
  REFUNDED: "#8B5CF6",
  REFUND_CONFIRMED: "#06B6D4",
  COMPLETED: "#008F91",
  DELIVERY_COMPLETED: "#00C7C7",
};

const ORDER_STATUS_LABELS = {
  READY_TO_PICK_UP: "Ready for pickup",
  RIDER_ON_THE_WAY: "Rider on the way",
  DELIVERY_COMPLETED: "Delivery completed",
  REFUND_PENDING: "Refund pending",
  REFUND_CONFIRMED: "Refund confirmed",
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "Data unavailable";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatStatus(value) {
  const normalized = String(value || "PENDING").toUpperCase();
  return ORDER_STATUS_LABELS[normalized] || normalized.replaceAll("_", " ");
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", options).format(date);
}

function formatBucket(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function shortId(value) {
  return value ? `#${String(value).split("-")[0].toUpperCase()}` : "—";
}

function DashboardHeader({ range, setRange, onRefresh, loading, lastUpdated, todayLabel }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white">Admin dashboard</h1>
          <p className="mt-2 max-w-2xl text-xs text-white/65">A live operations view of accounts, shops, approvals, and order activity.</p>
          <p className="mt-3 text-[11px] text-white/45">{lastUpdated ? `Last updated ${formatDate(lastUpdated, { dateStyle: "medium", timeStyle: "short" })}` : todayLabel ? `Today · ${todayLabel}` : "Waiting for the first update"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75">
            <span className="sr-only">Analytics date range</span>
            <span aria-hidden="true">Range</span>
            <select value={range} onChange={(event) => setRange(event.target.value)} className="bg-transparent text-xs font-bold text-white outline-none [&>option]:text-slate-900" aria-label="Analytics date range">
              {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, caption, href, icon: Icon, accent, valueFormatter = formatNumber }) {
  const content = (
    <article className="relative h-full overflow-hidden border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300">
      <div className={`absolute left-0 top-0 h-1 w-full ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <Icon size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{valueFormatter(value)}</p>
      <p className="mt-1 text-[11px] text-slate-500">{caption}</p>
      {href && <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#008F91]">Open details <ArrowRight size={12} /></span>}
    </article>
  );

  return href ? <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]">{content}</Link> : content;
}

function ChartPanel({ title, description, children, summary }) {
  return (
    <section className="border-t-2 border-[#1A1A1A] bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{description}</p></div>
      </div>
      {children}
      {summary}
    </section>
  );
}

function ChartEmpty({ message = "No data in this range." }) {
  return <div className="flex h-[250px] items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-500">{message}</div>;
}

function SummaryGrid({ rows, valueFormatter = formatNumber }) {
  if (!rows?.length) return <p className="mt-3 text-[11px] text-slate-400">No records in this range.</p>;
  return <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 sm:grid-cols-3">{rows.slice(0, 6).map((row) => <div key={row.label} className="flex min-w-0 items-center justify-between gap-2 text-[11px]"><span className="truncate text-slate-500">{row.label}</span><strong className="text-slate-800">{valueFormatter(row.value)}</strong></div>)}</div>;
}

function StatusChart({ title, description, rows, colors }) {
  const chartRows = (rows || []).map((row) => ({ ...row, label: formatStatus(row.status) }));
  return (
    <ChartPanel title={title} description={description} summary={<SummaryGrid rows={chartRows.map((row) => ({ label: row.label, value: row.count }))} />}>
      {chartRows.length === 0 ? <ChartEmpty /> : <div className="h-[250px] w-full" role="img" aria-label={`${title} chart`}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartRows} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius="48%" outerRadius="78%" paddingAngle={3}>{chartRows.map((row, index) => <Cell key={`${row.status}-${index}`} fill={colors[row.status] || ["#00C7C7", "#EC008C", "#FFF200", "#64748B"][index % 4]} />)}</Pie><Tooltip formatter={(value, name) => [formatNumber(value), name]} /><Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: "11px" }} /></PieChart></ResponsiveContainer></div>}
    </ChartPanel>
  );
}

function ActionList({ title, description, items, emptyMessage, href, icon: Icon, renderItem }) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-[#EC008C]" aria-hidden="true" /><div><h2 className="text-sm font-black text-slate-900">{title}</h2><p className="mt-0.5 text-[11px] text-slate-500">{description}</p></div></div>{href && <Link href={href} className="shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-[#008F91] hover:text-[#EC008C]">View all</Link>}</div>
      {items?.length ? <div className="divide-y divide-slate-100">{items.map(renderItem)}</div> : <p className="border-t border-slate-100 py-5 text-center text-[11px] text-slate-400">{emptyMessage}</p>}
    </section>
  );
}

function ActionRow({ title, subtitle, status, timestamp, href }) {
  const row = <div className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{title}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 size={11} aria-hidden="true" /> {formatDate(timestamp, { month: "short", day: "numeric", year: "numeric" })}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${status === "APPROVED" || status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : status === "REJECTED" || status === "ARCHIVED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{formatStatus(status)}</span></div>;
  return href ? <Link href={href} className="block transition-colors hover:bg-slate-50">{row}</Link> : row;
}

function RecentAccounts({ title, accounts, href }) {
  return <section className="border-t-2 border-[#00C7C7] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900">{title}</h2><Link href={href} className="text-[10px] font-black uppercase tracking-[0.08em] text-[#008F91] hover:text-[#EC008C]">All accounts</Link></div>{accounts?.length ? <div className="divide-y divide-slate-100">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{account.full_name || "User Account"}</p><p className="truncate text-[11px] text-slate-500">{account.email || "No email on profile"}</p></div><span className="shrink-0 text-[10px] text-slate-400">{formatDate(account.created_at, { month: "short", day: "numeric" })}</span></div>)}</div> : <p className="py-5 text-center text-[11px] text-slate-400">No recent accounts.</p>}</section>;
}

function RecentShops({ shops }) {
  return <section className="border-t-2 border-[#FFF200] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900">Recent shops</h2><Link href="/admin/shops" className="text-[10px] font-black uppercase tracking-[0.08em] text-[#008F91] hover:text-[#EC008C]">Open shops</Link></div>{shops?.length ? <div className="divide-y divide-slate-100">{shops.map((shop) => <Link href="/admin/shops" key={shop.id} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{shop.name || "Unnamed shop"}</p><p className="text-[11px] text-slate-500">Created {formatDate(shop.created_at, { month: "short", day: "numeric" })}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${shop.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : shop.status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{formatStatus(shop.status)}</span></Link>)}</div> : <p className="py-5 text-center text-[11px] text-slate-400">No recent shops.</p>}</section>;
}

function RecentOrders({ orders }) {
  return <section className="border-t-2 border-[#EC008C] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900">Recent orders</h2><span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Latest 5</span></div>{orders?.length ? <div className="divide-y divide-slate-100">{orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="text-xs font-bold text-slate-800">{shortId(order.id)} · {order.business_name || "Shop"}</p><p className="text-[11px] text-slate-500">{formatDate(order.created_at, { month: "short", day: "numeric" })} · {formatCurrency(order.total)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${order.status === "COMPLETED" || order.status === "DELIVERY_COMPLETED" ? "bg-emerald-100 text-emerald-800" : order.status === "CANCELLED" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{formatStatus(order.status)}</span></div>)}</div> : <p className="py-5 text-center text-[11px] text-slate-400">No recent orders.</p>}</section>;
}

function DashboardSkeleton() {
  return <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="h-28 animate-pulse bg-white/80" /><div className="h-28 animate-pulse bg-white/80" /><div className="h-28 animate-pulse bg-white/80" /><div className="h-28 animate-pulse bg-white/80" /></div><div className="grid gap-5 lg:grid-cols-2"><div className="h-80 animate-pulse bg-white/80" /><div className="h-80 animate-pulse bg-white/80" /></div><div className="grid gap-5 lg:grid-cols-3"><div className="h-56 animate-pulse bg-white/80" /><div className="h-56 animate-pulse bg-white/80" /><div className="h-56 animate-pulse bg-white/80" /></div></div>;
}

export default function AdminDashboard() {
  const [range, setRange] = useState("30");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    setTodayLabel(new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(new Date()));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");

        const response = await fetch(`/api/admin/operations?range=${encodeURIComponent(range)}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const requestError = new Error(payload.details || payload.error || "Dashboard data is unavailable.");
          requestError.expectedApiError = true;
          throw requestError;
        }
        if (active) setDashboard(payload);
      } catch (loadError) {
        if (loadError.name === "AbortError" || !active) return;
        if (!loadError.expectedApiError) console.error("Admin dashboard load error:", loadError);
        setError(loadError.message || "Dashboard data is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => { active = false; controller.abort(); };
  }, [range, refreshVersion]);

  const kpis = dashboard?.kpis || {};
  const charts = dashboard?.charts || {};
  const actions = dashboard?.actions || {};
  const recent = dashboard?.recent || {};

  return (
    <main className="admin-page min-h-screen bg-[#F6F6F2] pb-24 font-sans text-slate-900">
      <DashboardHeader range={range} setRange={setRange} onRefresh={() => setRefreshVersion((current) => current + 1)} loading={loading} lastUpdated={dashboard?.generatedAt} todayLabel={todayLabel} />

      {error && <div className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8"><div className="flex flex-col gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between" role="alert"><div className="flex items-start gap-2"><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><div><p className="font-black">Dashboard data unavailable</p><p className="mt-1 text-xs">{error}</p></div></div><button type="button" onClick={() => setRefreshVersion((current) => current + 1)} className="inline-flex items-center gap-2 self-start bg-[#1A1A1A] px-4 py-2 text-xs font-black text-white hover:bg-[#EC008C]">Retry <RefreshCcw size={13} /></button></div></div>}

      {!dashboard && loading ? <DashboardSkeleton /> : dashboard ? <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section aria-labelledby="kpi-heading"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Current snapshot</p><h2 id="kpi-heading" className="mt-1 text-lg font-black text-slate-900">Platform pulse</h2></div><p className="text-right text-[10px] text-slate-400">Analytics charts use {RANGE_OPTIONS.find((option) => option.value === range)?.label.toLowerCase()} · KPI totals are current</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8"><KpiCard label="Customers" value={kpis.totalCustomers} caption="Registered accounts" href="/admin/accounts" icon={Users} accent="bg-[#00C7C7]" /><KpiCard label="Business owners" value={kpis.totalBusinessOwners} caption="Owner accounts" href="/admin/accounts" icon={Building2} accent="bg-[#FFF200]" /><KpiCard label="Registered shops" value={kpis.totalShops} caption="All shop records" href="/admin/shops" icon={ShoppingBag} accent="bg-[#EC008C]" /><KpiCard label="Pending verifications" value={kpis.pendingVerifications} caption="Need document review" href="/admin/verifications" icon={ShieldCheck} accent="bg-[#FFF200]" /><KpiCard label="Pending categories" value={kpis.pendingCategoryApprovals} caption="Need approval" href="/admin/shops" icon={Tag} accent="bg-[#EC008C]" /><KpiCard label="Total orders" value={kpis.totalOrders} caption={`${formatNumber(kpis.completedOrders)} completed`} icon={ShoppingBag} accent="bg-[#008F91]" /><KpiCard label="Active shops" value={kpis.activeShops} caption={`${formatNumber(kpis.lockedShops)} locked`} href="/admin/shops" icon={CheckCircle2} accent="bg-[#00C7C7]" /><KpiCard label="Completed value" value={kpis.completedRevenue} valueFormatter={formatCurrency} caption="Completed order totals" icon={BarChart3} accent="bg-[#1A1A1A]" /></div></section>

        {loading && <div className="flex items-center gap-2 text-[11px] font-bold text-[#008F91]" role="status"><Loader2 size={14} className="animate-spin" /> Updating dashboard data…</div>}

        <section aria-labelledby="analytics-heading"><div className="mb-3"><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Trends and distribution</p><h2 id="analytics-heading" className="mt-1 text-lg font-black text-slate-900">Analytics</h2></div><div className="grid gap-5 xl:grid-cols-2">
          <ChartPanel title="User growth" description="Customer and Business Owner registrations by UTC bucket." summary={<SummaryGrid rows={(charts.userGrowth || []).slice(-6).map((row) => ({ label: formatBucket(row.bucket), value: row.total }))} />}>
            {charts.userGrowth?.length ? <div className="h-[250px] w-full" role="img" aria-label="User growth line chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={charts.userGrowth}><defs><linearGradient id="customerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00C7C7" stopOpacity={0.35} /><stop offset="95%" stopColor="#00C7C7" stopOpacity={0} /></linearGradient><linearGradient id="ownerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EC008C" stopOpacity={0.3} /><stop offset="95%" stopColor="#EC008C" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" /><XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 10 }} minTickGap={24} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={formatBucket} formatter={(value, name) => [formatNumber(value), name === "business_owners" ? "Business owners" : "Customers"]} /><Legend formatter={(value) => value === "business_owners" ? "Business owners" : "Customers"} wrapperStyle={{ fontSize: "11px" }} /><Area type="monotone" dataKey="customers" stroke="#00AFC0" fill="url(#customerFill)" strokeWidth={2} /><Area type="monotone" dataKey="business_owners" stroke="#EC008C" fill="url(#ownerFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <ChartEmpty />}
          </ChartPanel>

          <ChartPanel title="Order activity" description="Orders created and completed order value by UTC bucket." summary={<SummaryGrid rows={(charts.orderActivity || []).slice(-6).map((row) => ({ label: formatBucket(row.bucket), value: row.orders }))} />}>
            {charts.orderActivity?.length ? <div className="h-[250px] w-full" role="img" aria-label="Order activity line chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={charts.orderActivity}><CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" /><XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 10 }} minTickGap={24} /><YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 10 }} /><YAxis yAxisId="value" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip labelFormatter={formatBucket} formatter={(value, name) => [name === "completed_revenue" ? formatCurrency(value) : formatNumber(value), name === "completed_revenue" ? "Completed value" : "Orders"]} /><Legend formatter={(value) => value === "completed_revenue" ? "Completed value" : "Orders"} wrapperStyle={{ fontSize: "11px" }} /><Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#008F91" strokeWidth={2} dot={false} /><Line yAxisId="value" type="monotone" dataKey="completed_revenue" stroke="#EC008C" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <ChartEmpty />}
          </ChartPanel>

          <ChartPanel title="Orders by status" description="Status mix for orders in the selected analytics range." summary={<SummaryGrid rows={(charts.ordersByStatus || []).map((row) => ({ label: formatStatus(row.status), value: row.count }))} />}>
            {charts.ordersByStatus?.length ? <div className="h-[250px] w-full" role="img" aria-label="Orders by status bar chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={charts.ordersByStatus} margin={{ top: 8, right: 8, left: -12, bottom: 34 }}><CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" /><XAxis dataKey="status" tickFormatter={formatStatus} tick={{ fontSize: 9 }} angle={-25} textAnchor="end" interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={formatStatus} formatter={(value) => [formatNumber(value), "Orders"]} /><Bar dataKey="count" name="Orders" fill="#00C7C7" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty />}
          </ChartPanel>

          <div className="grid gap-5 md:grid-cols-2"><StatusChart title="Shop verification status" description="Current approval state of every registered shop." rows={charts.shopVerification} colors={STATUS_COLORS} /><StatusChart title="Category approval status" description="Current state of submitted category requests." rows={charts.categoryApproval} colors={STATUS_COLORS} /></div>
        </div></section>

        <section aria-labelledby="actions-heading"><div className="mb-3"><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#FFF200]">What needs attention</p><h2 id="actions-heading" className="mt-1 text-lg font-black text-slate-900">Action center</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ActionList title="Pending verifications" description="Business shops waiting for review." items={actions.pendingVerifications} emptyMessage="No business verifications are waiting." href="/admin/verifications" icon={ShieldCheck} renderItem={(item) => <ActionRow key={item.id} title={item.name || "Unnamed shop"} subtitle={`Owner: ${item.owner_name || "Unknown"}`} status={item.status} timestamp={item.created_at} href="/admin/verifications" />} />
          <ActionList title="Pending categories" description="New categories waiting for approval." items={actions.pendingCategoryApprovals} emptyMessage="No category approvals are waiting." href="/admin/shops" icon={Tag} renderItem={(item) => <ActionRow key={item.id} title={item.category_name} subtitle={item.business_name || "Unknown shop"} status={item.status} timestamp={item.created_at} href="/admin/shops" />} />
          <ActionList title="Profile changes" description="Recent owner profile requests." items={actions.recentProfileRequests} emptyMessage="No profile change requests found." href="/admin/verifications" icon={Users} renderItem={(item) => <ActionRow key={item.id} title={item.business_name || "Unknown shop"} subtitle={item.reason || "No reason provided"} status={item.status} timestamp={item.created_at} href="/admin/verifications" />} />
          <ActionList title="Shops requiring attention" description="Rejected, locked, or archived shops." items={actions.attentionShops} emptyMessage="No shops require attention." href="/admin/verifications" icon={Building2} renderItem={(item) => <ActionRow key={item.id} title={item.name || "Unnamed shop"} subtitle={item.lock_reason || "Shop status requires review"} status={item.lifecycle_state === "ACTIVE" ? item.status : item.lifecycle_state} timestamp={item.last_activity_at || item.created_at} href="/admin/verifications" />} />
          <ActionList title="Refunds and cancellations" description="Recent order items requiring follow-up." items={actions.refundItems} emptyMessage="No refund or cancellation items found." icon={ShoppingBag} renderItem={(item) => <ActionRow key={item.id} title={`${shortId(item.id)} · ${item.business_name || "Shop"}`} subtitle={formatCurrency(item.total)} status={item.status} timestamp={item.created_at} />} />
        </div></section>

        <section aria-labelledby="recent-heading"><div className="mb-3"><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#00FFFF]">Latest records</p><h2 id="recent-heading" className="mt-1 text-lg font-black text-slate-900">Recent activity</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><RecentAccounts title="Recent customer accounts" accounts={recent.customers} href="/admin/accounts" /><RecentAccounts title="Recent owner accounts" accounts={recent.businessOwners} href="/admin/accounts" /><RecentShops shops={recent.shops} /><RecentOrders orders={recent.orders} /></div></section>
      </div> : !loading && <div className="mx-auto max-w-md px-4 py-16 text-center"><AlertCircle size={30} className="mx-auto mb-3 text-[#EC008C]" /><p className="text-sm font-black text-slate-800">No dashboard data available</p><p className="mt-1 text-xs text-slate-500">Use Retry to request a fresh Admin snapshot.</p></div>}
    </main>
  );
}
