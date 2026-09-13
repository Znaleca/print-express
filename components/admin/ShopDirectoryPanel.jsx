"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Search,
  Star,
  Store,
  Tag,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_DATA = {
  shops: [],
  shopPagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 1 },
  totals: { totalShops: 0, totalReviews: 0, visibleReviews: 0, hiddenReviews: 0, pendingCategoryApprovals: 0, totalServices: 0 },
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function statusLabel(value) {
  return String(value || "PENDING").replaceAll("_", " ");
}

function statusClass(value) {
  const status = String(value || "PENDING").toUpperCase();
  if (status === "APPROVED" || status === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED" || status === "ARCHIVED") return "bg-rose-100 text-rose-800";
  if (status === "LOCKED") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function StatusBadge({ value }) {
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.04em] ${statusClass(value)}`}>{statusLabel(value)}</span>;
}

function Pager({ pagination }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" aria-label="Shop pagination"><p className="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} shops</p><div className="flex items-center gap-2"><button type="button" onClick={() => pagination.onPageChange(pagination.page - 1)} disabled={pagination.page <= 1} aria-label="Previous shop page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><button type="button" onClick={() => pagination.onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} aria-label="Next shop page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} /></button></div></div>;
}

export default function ShopDirectoryPanel() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("ALL");
  const [lifecycle, setLifecycle] = useState("ALL");
  const [shopPage, setShopPage] = useState(1);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const params = new URLSearchParams({ search, approvalStatus, lifecycle, page: String(shopPage) });
      const response = await fetch(`/api/admin/shops?${params.toString()}`, { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Shop directory is unavailable.");
      setData(payload);
    } catch (loadError) {
      console.error("Admin shop directory load error:", loadError);
      setData(EMPTY_DATA);
      setError(loadError.message || "Shop directory is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [approvalStatus, lifecycle, search, shopPage]);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  const changeSearch = (value) => { setSearch(value); setShopPage(1); };
  const changeApprovalStatus = (value) => { setApprovalStatus(value); setShopPage(1); };
  const changeLifecycle = (value) => { setLifecycle(value); setShopPage(1); };
  const shopPagination = { ...(data.shopPagination || EMPTY_DATA.shopPagination), onPageChange: setShopPage };
  const totals = data.totals || EMPTY_DATA.totals;

  if (loading && data.shops.length === 0) {
    return <main className="admin-page flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F6F6F2] font-sans text-slate-600"><div className="flex flex-col items-center gap-3"><Loader2 size={36} className="animate-spin text-[#EC008C]" /><p className="text-xs font-semibold uppercase tracking-wider">Loading shop directory...</p></div></main>;
  }

  if (error && data.shops.length === 0) {
    return <main className="admin-page flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F6F6F2] px-6 font-sans text-slate-900"><div className="w-full max-w-md border border-rose-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 text-[#EC008C]" size={34} /><h1 className="text-xl font-black">Shop directory unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={fetchShops} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#EC008C]"><RefreshCcw size={14} /> Retry</button></div></main>;
  }

  return <main className="admin-page min-h-screen overflow-x-hidden bg-[#F6F6F2] pb-24 font-sans text-slate-900">
    <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</p><h1 className="text-3xl font-black uppercase tracking-tight">Shops</h1><p className="mt-2 max-w-2xl text-xs text-white/65">Browse the full shop directory and open any shop for its services, reviews, and catalog information.</p></div><button type="button" onClick={fetchShops} disabled={loading} className="inline-flex items-center gap-1.5 self-start border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:self-auto"><RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button></div></section>
    <section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="border-l-4 border-[#00C7C7] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Shops</p><p className="mt-1 text-xl font-black">{shopPagination.totalItems || 0}</p></div><div className="border-l-4 border-[#EC008C] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Reviews</p><p className="mt-1 text-xl font-black">{totals.totalReviews || 0}</p></div><div className="border-l-4 border-[#FFF200] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pending categories</p><p className="mt-1 text-xl font-black">{totals.pendingCategoryApprovals || 0}</p></div><div className="border-l-4 border-emerald-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Services</p><p className="mt-1 text-xl font-black">{totals.totalServices || 0}</p></div></div>
      <div className="mb-5 grid grid-cols-1 gap-3 border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_210px_210px]"><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Search shops or owners<span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search shop or owner name..." aria-label="Search shops or owners" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-[#00C7C7] focus:bg-white" /></span></label><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Approval status<select value={approvalStatus} onChange={(event) => changeApprovalStatus(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All shops</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Lifecycle<select value={lifecycle} onChange={(event) => changeLifecycle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All lifecycle states</option><option value="ACTIVE">Active</option><option value="LOCKED">Locked</option><option value="ARCHIVED">Archived</option></select></label></div>
      {error && <div className="mb-4 flex items-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800" role="alert"><AlertCircle size={16} /> {error}<button type="button" onClick={fetchShops} className="ml-auto font-black underline">Retry</button></div>}
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Directory</p><h2 className="mt-1 text-lg font-black">All shops</h2></div><p className="text-right text-[10px] text-slate-500">{shopPagination.totalItems || 0} results · 15 per page</p></div>
      {data.shops.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center"><Store size={34} className="mx-auto mb-3 text-slate-300" aria-hidden="true" /><p className="text-sm font-black text-slate-700">No matching shops</p><p className="mt-1 text-xs text-slate-500">Try another search or clear one of the status filters.</p></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.shops.map((shop) => <Link key={shop.shopId} href={`/admin/shops/${shop.shopId}`} className="group min-w-0 border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-[#00C7C7] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-black text-slate-900">{shop.shopName}</h3><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><UserRound size={13} aria-hidden="true" /> {shop.ownerName}</p></div><Store size={19} className="shrink-0 text-[#008F91] transition-colors group-hover:text-[#EC008C]" aria-hidden="true" /></div><div className="mt-3 flex flex-wrap gap-1.5"><StatusBadge value={shop.approvalStatus} /><StatusBadge value={shop.lifecycleState} /></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs"><div className="flex items-center gap-1 font-bold text-slate-700"><Star size={14} className="fill-[#FFF200] text-[#D1C500]" /> {shop.averageRating} <span className="font-medium text-slate-400">({shop.totalReviewCount})</span></div><div className="flex items-center justify-end gap-1 font-bold text-amber-700"><Tag size={14} /> {shop.pendingCategoryCount} pending</div><div className="flex items-center gap-1 text-slate-500"><Building2 size={13} /> {shop.serviceCount} service{shop.serviceCount === 1 ? "" : "s"}</div><span className="text-right text-slate-500">{shop.visibleCount} visible · {shop.hiddenCount} hidden</span></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span>Updated {formatDate(shop.latestActivityDate)}</span><span className="font-black uppercase tracking-[0.08em] text-[#008F91]">Open details <ChevronRight size={13} className="inline" aria-hidden="true" /></span></div></Link>)}</div>}
      <Pager pagination={shopPagination} />
    </section>
  </main>;
}
