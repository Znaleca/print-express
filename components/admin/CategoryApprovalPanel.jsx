"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Search,
  Store,
  Tag,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_DATA = {
  shops: [],
  selectedShop: null,
  shopPagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 },
  totals: { total: 0, pending: 0, approved: 0, rejected: 0 },
};

function statusClass(status) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function Pager({ pagination, onPageChange, label }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3" aria-label={`${label} pagination`}>
      <p className="text-[11px] text-slate-500">Page {pagination.page} of {pagination.totalPages}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page <= 1} aria-label={`Previous ${label.toLowerCase()} page`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={14} aria-hidden="true" /> Previous</button>
        <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} aria-label={`Next ${label.toLowerCase()} page`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={14} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export default function CategoryApprovalPanel() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [shopPage, setShopPage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);
  const requestSequence = useRef(0);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const params = new URLSearchParams({ search, status, page: String(shopPage), requestPage: String(requestPage) });
      if (selectedShopId) params.set("shopId", selectedShopId);
      const response = await fetch(`/api/admin/category-approvals?${params.toString()}`, { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Category approval data is unavailable.");
      if (sequence === requestSequence.current) setData(payload);
    } catch (loadError) {
      if (sequence !== requestSequence.current) return;
      console.error("Admin category approval load error:", loadError);
      setData(EMPTY_DATA);
      setError(loadError.message || "Category approval data is unavailable.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [requestPage, search, selectedShopId, shopPage, status]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleCategoryAction = async (requestId, newStatus) => {
    setActionLoading((current) => ({ ...current, [requestId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const response = await fetch("/api/admin/category-approvals", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ requestId, status: newStatus }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to update category request.");
      showToast(`Category request ${newStatus.toLowerCase()}.`);
      await fetchRequests();
    } catch (actionError) {
      showToast(actionError.message || "Failed to update category request.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [requestId]: false }));
    }
  };

  if (loading && !data.selectedShop && data.shops.length === 0) {
    return <main className="admin-page flex min-h-screen items-center justify-center bg-[#F6F6F2] font-sans text-slate-600"><div className="flex flex-col items-center gap-3"><Loader2 size={36} className="animate-spin text-[#EC008C]" /><p className="text-xs font-semibold uppercase tracking-wider">Loading category approvals...</p></div></main>;
  }

  if (error && data.shops.length === 0) {
    return <main className="admin-page flex min-h-screen items-center justify-center bg-[#F6F6F2] px-6 font-sans text-slate-900"><div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 text-[#EC008C]" size={34} /><h1 className="text-xl font-black">Category requests unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={fetchRequests} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#EC008C]"><RefreshCcw size={14} /> Retry</button></div></main>;
  }

  const selectedShop = data.selectedShop;
  const shopPagination = data.shopPagination || EMPTY_DATA.shopPagination;
  const totals = data.totals || EMPTY_DATA.totals;

  return (
    <main className="admin-page min-h-screen bg-[#F6F6F2] pb-24 font-sans text-slate-900">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFF200]">Admin workspace</p><h1 className="text-3xl font-black uppercase tracking-tight">Category approvals</h1><p className="mt-2 max-w-2xl text-xs text-white/65">Review category requests by shop, owner, and approval status.</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-3 py-2 text-[11px] font-black text-[#FFF200]">{totals.pending || 0} pending</span><button type="button" onClick={fetchRequests} disabled={loading} className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"><RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button></div></div></section>
      {toast && <div className={`fixed bottom-6 right-6 z-[200] rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status">{toast.message}</div>}
      <section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Category approval totals"><div className="border-l-4 border-amber-300 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pending</p><p className="mt-1 text-xl font-black text-slate-900">{totals.pending || 0}</p></div><div className="border-l-4 border-emerald-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Approved</p><p className="mt-1 text-xl font-black text-slate-900">{totals.approved || 0}</p></div><div className="border-l-4 border-rose-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Rejected</p><p className="mt-1 text-xl font-black text-slate-900">{totals.rejected || 0}</p></div><div className="border-l-4 border-[#00C7C7] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Shops</p><p className="mt-1 text-xl font-black text-slate-900">{shopPagination.totalItems || 0}</p></div></div>
        <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px]"><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Search shops, owners, or categories<span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShopPage(1); setRequestPage(1); setSelectedShopId(null); }} placeholder="Search approval activity..." aria-label="Search shops, owners, or categories" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:border-[#00C7C7] focus:bg-white" /></span></label><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setShopPage(1); setRequestPage(1); setSelectedShopId(null); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label></div>
        {error && <div className="mb-4 flex items-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800" role="alert"><AlertCircle size={16} /> {error} <button type="button" onClick={fetchRequests} className="ml-auto font-black underline">Retry</button></div>}
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.7fr)]">
          <section className="min-w-0" aria-labelledby="category-shops-heading"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Shop directory</p><h2 id="category-shops-heading" className="mt-1 text-lg font-black">Business Owner shops</h2></div><p className="text-right text-[10px] text-slate-500">{shopPagination.totalItems || 0} shops</p></div>{data.shops.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 size={28} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-700">No matching shops</p><p className="mt-1 text-xs text-slate-500">Try another search or status filter.</p></div> : <div className="space-y-2">{data.shops.map((shop) => <button key={shop.shopId || "unknown"} type="button" onClick={() => { setSelectedShopId(shop.shopId); setRequestPage(1); }} aria-pressed={selectedShopId === shop.shopId} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedShopId === shop.shopId ? "border-[#00C7C7] bg-[#00C7C7]/10" : "border-slate-200 bg-white hover:border-[#00C7C7]/70 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{shop.shopName}</h3><p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500"><UserRound size={12} aria-hidden="true" /> {shop.ownerName}</p></div><Store size={17} className="shrink-0 text-[#008F91]" aria-hidden="true" /></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center"><div><p className="text-[10px] text-slate-400">Pending</p><p className="text-sm font-black text-amber-700">{shop.pendingCount}</p></div><div><p className="text-[10px] text-slate-400">Approved</p><p className="text-sm font-black text-emerald-700">{shop.approvedCount}</p></div><div><p className="text-[10px] text-slate-400">Rejected</p><p className="text-sm font-black text-rose-700">{shop.rejectedCount}</p></div></div><div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>{shop.overallActivity}</span><span>Last {formatDate(shop.latestRequestDate)}</span></div></button>)}</div>}<div className="mt-4"><Pager pagination={shopPagination} onPageChange={(page) => setShopPage(page)} label="Shop" /></div></section>
          <section className="min-w-0" aria-labelledby="category-detail-heading"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Selected shop</p><h2 id="category-detail-heading" className="mt-1 text-lg font-black">{selectedShop?.shopName || "Choose a shop"}</h2></div>{selectedShop && <button type="button" onClick={() => setSelectedShopId(null)} className="inline-flex items-center gap-1 text-xs font-bold text-[#008F91] hover:text-[#EC008C]"><ChevronLeft size={15} /> Back to shop list</button>}</div>{!selectedShop ? <div className="flex min-h-64 items-center justify-center border border-dashed border-slate-300 bg-white p-10 text-center"><div><Store size={30} className="mx-auto mb-3 text-slate-300" aria-hidden="true" /><p className="text-sm font-black text-slate-700">Select a shop to review its requests</p><p className="mt-1 text-xs text-slate-500">Category requests stay grouped by Business Owner shop.</p></div></div> : <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700"><UserRound size={12} /> {selectedShop.ownerName}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">{selectedShop.pendingCount} pending</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">{selectedShop.approvedCount} approved</span><span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-800">{selectedShop.rejectedCount} rejected</span></div>{selectedShop.requests.length === 0 ? <div className="py-12 text-center"><Tag size={28} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-700">{selectedShop.totalCount === 0 ? "No category approvals yet" : "No requests match this filter"}</p><p className="mt-1 text-xs text-slate-500">{selectedShop.totalCount === 0 ? "This shop has not submitted a category approval request." : "This shop has no category requests for the current search and status."}</p></div> : <div className="space-y-3">{selectedShop.requests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Tag size={15} className="text-[#EC008C]" aria-hidden="true" /><h3 className="text-sm font-black text-slate-900">{request.category_name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(request.status)}`}>{request.status}</span></div>{request.reason && <p className="mt-2 text-xs leading-relaxed text-slate-600">{request.reason}</p>}<p className="mt-2 text-[10px] text-slate-400">Requested {formatDate(request.created_at)}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => handleCategoryAction(request.id, "APPROVED")} disabled={actionLoading[request.id] || request.status === "APPROVED"} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Approve</button><button type="button" onClick={() => handleCategoryAction(request.id, "REJECTED")} disabled={actionLoading[request.id] || request.status === "REJECTED"} className="rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">Reject</button></div></div></article>)}</div>}<div className="mt-4"><Pager pagination={selectedShop.requestPagination} onPageChange={(page) => setRequestPage(page)} label="Request" /></div></div>}</section>
        </div>
      </section>
    </main>
  );
}
