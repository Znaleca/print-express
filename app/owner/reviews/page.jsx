"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AlertTriangle, Eye, EyeOff, Loader2, RefreshCcw, Star, X } from "lucide-react";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function RatingStars({ rating, size = 14 }) {
  return <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={size} className={star <= Number(rating) ? "fill-[#FFF200] text-[#D1C500]" : "text-slate-300"} aria-hidden="true" />)}</span>;
}

function requestStatusClass(status) {
  return status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
}

export default function OwnerReviews() {
  const [reviews, setReviews] = useState([]);
  const [hiddenReviews, setHiddenReviews] = useState([]);
  const [moderationRequests, setModerationRequests] = useState([]);
  const [ratingSummaries, setRatingSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterRating, setFilterRating] = useState(0);
  const [tab, setTab] = useState("active");
  const [toast, setToast] = useState(null);
  const [business, setBusiness] = useState(null);
  const [summary, setSummary] = useState({ total: 0, visible: 0, hidden: 0, averageRating: null, pendingRemovalRequests: 0 });
  const [loadError, setLoadError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [requestModal, setRequestModal] = useState(null);
  const [requestReason, setRequestReason] = useState("");

  const requestReviews = async (signal) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch("/api/owner/reviews", { method: "GET", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` }, signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === "OWNER_REVIEWS_UNAVAILABLE" ? "Reviews are temporarily unavailable. Please try again." : payload.error || "Could not load your reviews.");
    return payload;
  };

  const applyReviewPayload = (payload) => {
    setBusiness(payload.business || null);
    setReviews(payload.reviews || []);
    setHiddenReviews(payload.hiddenReviews || []);
    setModerationRequests(payload.moderationRequests || []);
    setRatingSummaries(payload.ratingSummaries || []);
    setSummary(payload.summary || { total: 0, visible: 0, hidden: 0, averageRating: null, pendingRemovalRequests: 0 });
  };

  useEffect(() => {
    let active = true;
    let subscription;
    let refreshTimer;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const payload = await requestReviews(controller.signal);
        if (!active) return;
        applyReviewPayload(payload);
        if (payload.business?.id) {
          subscription = supabase.channel(`owner_reviews_${payload.business.id}`).on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${payload.business.id}` }, () => {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(async () => {
              try { const nextPayload = await requestReviews(); if (active) applyReviewPayload(nextPayload); } catch (error) { if (active && error.name !== "AbortError") setLoadError("Reviews changed, but the latest data could not be loaded. Retry to refresh."); }
            }, 250);
          }).subscribe();
        }
      } catch (error) { if (active && error.name !== "AbortError") setLoadError(error.message || "Could not load your reviews."); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; controller.abort(); clearTimeout(refreshTimer); if (subscription) supabase.removeChannel(subscription); };
  }, []);

  const showToast = (message, type = "success") => { setToast({ message, type }); window.setTimeout(() => setToast(null), 3500); };
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true); setLoadError(null);
    try { applyReviewPayload(await requestReviews()); } catch (error) { if (error.name !== "AbortError") setLoadError(error.message || "Could not load your reviews."); }
    finally { setRefreshing(false); }
  };

  const submitRemovalRequest = async (event) => {
    event.preventDefault();
    if (!requestModal || requestReason.trim().length < 5 || actionLoading) return;
    setActionLoading(requestModal.order_id); setLoadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/owner/reviews", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ orderId: requestModal.order_id, reason: requestReason.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not submit the review removal request.");
      applyReviewPayload(await requestReviews());
      setRequestModal(null); setRequestReason("");
      showToast("Removal request sent. The review stays visible until an Admin decides.");
    } catch (error) { setLoadError(error.message || "Could not submit the review removal request."); }
    finally { setActionLoading(null); }
  };

  const currentList = tab === "active" ? reviews : hiddenReviews;
  const filteredList = filterRating > 0 ? currentList.filter((review) => Number(review.rating) === filterRating) : currentList;
  const avgRating = summary.averageRating == null ? "0.0" : Number(summary.averageRating).toFixed(1);
  if (loading) return <OwnerPageSkeleton rows={3} />;

  return <main data-tour="owner-reviews" className="owner-reviews-page min-h-screen bg-[#F6F6F2] pb-20 font-sans text-slate-900">
    <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-8 pt-8 text-white sm:px-8 lg:px-10"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="relative mx-auto flex max-w-[1600px] flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">Customer feedback</p><h1 className="mt-2 text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Reviews</h1><p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-[#00FFFF]">{business?.name || "Your shop"}</p><p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Review customer feedback and request Admin help when a review needs moderation.</p></div><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-3 py-2 text-xs font-bold hover:border-[#00FFFF] hover:text-[#00FFFF] disabled:opacity-60"><RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing..." : "Refresh"}</button><div className="flex items-center gap-3 bg-white/10 p-3 ring-1 ring-white/15"><div className="text-center"><span className="text-2xl font-black">{avgRating}</span><div className="flex justify-center"><Star size={12} className="fill-[#FFF200] text-[#FFF200]" /></div></div><div className="border-l border-white/20 pl-3 text-[11px] text-white/70"><p>{summary.visible} visible</p><p>{summary.hidden} hidden</p><p>{summary.pendingRemovalRequests || 0} pending request{summary.pendingRemovalRequests === 1 ? "" : "s"}</p></div></div></div></div></section>
    {toast && <div className={`fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status" aria-live="polite">{toast.message}</div>}
    <section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
      {loadError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800"><span className="flex items-center gap-2"><AlertTriangle size={15} /> {loadError}</span><button type="button" onClick={handleRefresh} disabled={refreshing} className="font-black underline">Retry</button></div>}
      <div className="mb-6 grid gap-3 border border-[#D8D6CE] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><div className="border-l-4 border-[#00C7C7] px-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Shop average</p><p className="mt-1 text-2xl font-black">{avgRating} <span className="text-sm text-slate-400">/ 5</span></p></div><div className="border-l-4 border-emerald-400 px-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Visible reviews</p><p className="mt-1 text-2xl font-black">{summary.visible}</p></div><div className="border-l-4 border-rose-400 px-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Admin-hidden reviews</p><p className="mt-1 text-2xl font-black">{summary.hidden}</p></div><div className="border-l-4 border-[#FFF200] px-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Removal requests</p><p className="mt-1 text-2xl font-black">{summary.pendingRemovalRequests || 0} <span className="text-sm text-slate-400">pending</span></p></div></div>
      {ratingSummaries.length > 0 && <section className="mb-6 border border-[#D8D6CE] bg-white p-4" aria-labelledby="owner-rating-summary"><div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Catalog feedback</p><h2 id="owner-rating-summary" className="mt-1 text-lg font-black">Service &amp; product ratings</h2></div><p className="text-[10px] text-slate-500">Visible averages only</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ratingSummaries.map((item) => <div key={item.serviceId} className="border border-slate-200 bg-[#F6F6F2] p-3"><div className="flex items-start justify-between gap-2"><p className="text-xs font-black">{item.name}</p><span className="text-[9px] font-bold uppercase text-slate-400">{item.itemType === "product" ? "Product" : "Service"}</span></div><div className="mt-2 flex items-center gap-2"><RatingStars rating={item.averageRating || 0} size={12} /><span className="text-xs font-black">{item.averageRating == null ? "No ratings" : item.averageRating}</span><span className="text-[10px] text-slate-500">({item.visible} visible)</span></div></div>)}</div></section>}
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex gap-2 border-b border-slate-200"><button type="button" onClick={() => setTab("active")} className={`pb-3 text-xs font-bold ${tab === "active" ? "border-b-2 border-[#EC008C] text-slate-900" : "text-slate-500"}`}>Visible Reviews ({reviews.length})</button><button type="button" onClick={() => setTab("hidden")} className={`pb-3 text-xs font-bold ${tab === "hidden" ? "border-b-2 border-[#EC008C] text-slate-900" : "text-slate-500"}`}>Admin-hidden Reviews ({hiddenReviews.length})</button></div><div className="flex items-center gap-1 border border-slate-200 bg-white p-1.5"><span className="px-2 text-xs font-semibold text-slate-500">Rating:</span>{[0, 5, 4, 3, 2, 1].map((rating) => <button key={rating} type="button" onClick={() => setFilterRating(rating)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${filterRating === rating ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{rating === 0 ? "All" : `${rating}★`}</button>)}</div></div>
      {filteredList.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center text-xs font-medium text-slate-400">{tab === "active" ? "No visible reviews yet." : "No Admin-hidden reviews yet."}</div> : <div className="space-y-3">{filteredList.map((review) => { const requests = review.moderationRequests || moderationRequests.filter((request) => request.order_id === review.order_id); const latestRequest = requests[0]; return <article key={review.order_id} className="border border-[#D8D6CE] bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0 max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black">{review.customer_name || "Verified Customer"}</span><RatingStars rating={review.rating} /><span className={`rounded-full px-2 py-1 text-[10px] font-black ${review.feedback_hidden ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{review.feedback_hidden ? "HIDDEN BY ADMIN" : "VISIBLE"}</span></div><p className="mt-3 text-xs leading-relaxed text-slate-700">“{review.feedback || "No written comment provided."}”</p><p className="mt-2 text-[10px] text-slate-400">Order #{String(review.order_id || "").split("-")[0].toUpperCase()} · {formatDate(review.created_at)}{review.item_name ? ` · ${review.item_name}` : ""}</p>{latestRequest && <div className="mt-3 border-l-2 border-[#FFF200] bg-[#FFF200]/10 px-3 py-2 text-xs"><div className="flex flex-wrap items-center gap-2"><strong>Removal request</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${requestStatusClass(latestRequest.status)}`}>{latestRequest.status}</span></div><p className="mt-1 text-slate-600">Reason: {latestRequest.reason}</p>{latestRequest.admin_response && <p className="mt-1 text-slate-700"><strong>Admin response:</strong> {latestRequest.admin_response}</p>}<p className="mt-1 text-[10px] text-slate-500">Submitted {formatDate(latestRequest.created_at)}{latestRequest.reviewed_at ? ` · reviewed ${formatDate(latestRequest.reviewed_at)}` : ""}</p></div>}</div><div className="shrink-0">{tab === "active" && (!latestRequest || latestRequest.status !== "PENDING") && <button type="button" onClick={() => { setRequestModal(review); setRequestReason(""); }} disabled={actionLoading === review.order_id} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><EyeOff size={14} /> Request review removal</button>}{tab === "active" && latestRequest?.status === "PENDING" && <p className="max-w-[220px] text-right text-[11px] font-semibold text-amber-800">Pending Admin review. This review remains visible.</p>}{tab === "hidden" && <p className="max-w-[220px] text-right text-[11px] font-semibold text-slate-500"><Eye size={14} className="ml-auto mb-1" />Only an Admin can restore review visibility.</p>}</div></div></article>; })}</div>}
    </section>
    {requestModal && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="review-removal-title" onClick={() => !actionLoading && setRequestModal(null)}><form onSubmit={submitRemovalRequest} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg border border-[#D8D6CE] bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Admin review request</p><h2 id="review-removal-title" className="mt-1 text-xl font-black">Request review removal</h2></div><button type="button" onClick={() => setRequestModal(null)} disabled={Boolean(actionLoading)} aria-label="Close request form" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><p className="mt-4 border-l-4 border-[#FFF200] bg-[#FFF200]/10 px-3 py-2 text-xs leading-relaxed text-slate-700">The review will stay visible while an Admin reviews your request. Explain the specific issue so the decision can be audited.</p><label htmlFor="review-removal-reason" className="mt-4 block text-xs font-bold text-slate-800">Reason <span className="text-[#EC008C]">*</span><textarea id="review-removal-reason" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} minLength={5} maxLength={1000} required rows={5} autoFocus placeholder="Explain why this review should be reviewed for removal..." className="mt-1.5 w-full resize-none border border-slate-300 px-3 py-2.5 text-xs outline-none focus:border-[#EC008C] focus:ring-2 focus:ring-[#EC008C]/20" /></label><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRequestModal(null)} disabled={Boolean(actionLoading)} className="border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" disabled={requestReason.trim().length < 5 || Boolean(actionLoading)} className="inline-flex items-center justify-center gap-2 bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white hover:bg-[#EC008C] disabled:opacity-50">{actionLoading && <Loader2 size={14} className="animate-spin" />} Submit request</button></div></form></div>}
  </main>;
}
