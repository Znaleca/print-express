"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, RefreshCcw, Search, Star, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { maskReviewText, normalizeFilterWord } from "@/lib/reviewText";

const EMPTY_DATA = {
  reviews: [],
  moderationRequests: [],
  moderationSummary: { total: 0, pending: 0, approved: 0, rejected: 0 },
  reviewPagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 1 },
  totals: { total: 0, visible: 0, hidden: 0, averageRating: "0.0" },
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function statusClass(status) {
  return status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
}

function Stars({ rating }) {
  return <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={13} className={star <= Number(rating) ? "fill-[#FFF200] text-[#D1C500]" : "text-slate-300"} aria-hidden="true" />)}</span>;
}

function PendingRequestActions({ review, requestResponses, setRequestResponses, actionLoading, moderateRequest }) {
  const requestRow = review.pending_request;
  const actionKey = `request-${requestRow.id}`;
  return <div className="mt-3 border border-[#E6C94A] bg-[#FFFBE0] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">PENDING ADMIN REVIEW</span><span className="text-[10px] text-slate-500">Requested {formatDate(requestRow.created_at)}</span></div><p className="mt-2 text-xs text-slate-700"><strong>Owner reason:</strong> {requestRow.reason}</p><label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">Admin response<textarea value={requestResponses[requestRow.id] || ""} onChange={(event) => setRequestResponses((current) => ({ ...current, [requestRow.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Optional note for the owner..." className="mt-1 w-full resize-none border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#00C7C7]" /></label><div className="mt-3 flex gap-2"><button type="button" onClick={() => moderateRequest(requestRow, "REJECTED")} disabled={actionLoading[actionKey]} className="flex-1 border border-rose-200 bg-white px-3 py-2 text-[10px] font-black text-rose-700 hover:bg-rose-50 disabled:opacity-40">Reject</button><button type="button" onClick={() => moderateRequest(requestRow, "APPROVED")} disabled={actionLoading[actionKey]} className="flex-1 bg-[#1A1A1A] px-3 py-2 text-[10px] font-black text-white hover:bg-[#EC008C] disabled:opacity-40">Approve &amp; hide comment</button></div></div>;
}

function ReviewFeedback({ review }) {
  if (review.feedback_hidden) return <p className="mt-3 border-l-2 border-rose-300 bg-rose-50 px-3 py-2 text-xs italic leading-relaxed text-rose-700">Written comment hidden. The {review.rating}-star rating remains visible.</p>;
  if (!review.feedback) return <p className="mt-3 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-slate-500">No written comment. The {review.rating}-star rating remains visible.</p>;
  return <p className="mt-3 border-l-2 border-[#00C7C7] bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">“{review.feedback}”</p>;
}

function ReviewCard({ review, actionLoading, updateReviewVisibility, requestResponses, setRequestResponses, moderateRequest }) {
  const key = `review-${review.review_id}`;
  return <article className="border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><UserRound size={15} className="text-[#008F91]" /><h3 className="truncate text-sm font-black text-slate-900">{review.shop_name}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{review.review_type === "ITEM" ? "Product/service" : "Order"}</span></div><p className="mt-1 text-[11px] text-slate-500">Customer: {review.customer_name} · Owner: {review.owner_name}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${review.pending_request ? "bg-amber-100 text-amber-800" : review.feedback_hidden ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{review.pending_request ? "PENDING REQUEST" : review.feedback_hidden ? "COMMENT HIDDEN" : "COMMENT VISIBLE"}</span></div><div className="mt-3 flex flex-wrap items-center gap-2"><Stars rating={review.rating} /><span className="text-xs font-black">{review.rating}/5</span>{review.item_name && <span className="text-[10px] font-bold text-slate-500">· {review.item_name}</span>}</div><ReviewFeedback review={review} /><p className="mt-2 text-[10px] text-slate-400">Review date {formatDate(review.created_at)} · Order #{String(review.order_id || "").split("-")[0].toUpperCase()}</p>{review.pending_request ? <PendingRequestActions review={review} requestResponses={requestResponses} setRequestResponses={setRequestResponses} actionLoading={actionLoading} moderateRequest={moderateRequest} /> : <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-[10px] text-slate-400">{review.feedback_hidden ? `Hidden ${formatDate(review.feedback_hidden_at)}` : "Written comment is public"}</span><button type="button" onClick={() => updateReviewVisibility(review, !review.feedback_hidden)} disabled={actionLoading[key]} className={`inline-flex shrink-0 items-center justify-center gap-1.5 border px-3 py-2 text-[11px] font-bold disabled:opacity-40 ${review.feedback_hidden ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"}`}>{review.feedback_hidden ? <><Eye size={14} /> Restore comment</> : <><EyeOff size={14} /> Hide comment</>}</button></div>}</article>;
}

function Pager({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4" aria-label="Review pagination">
    <p className="text-[11px] text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} reviews</p>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page <= 1} aria-label="Previous review page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-[#00C7C7] disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
      <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} aria-label="Next review page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-[#00C7C7] disabled:opacity-40">Next <ChevronRight size={14} /></button>
    </div>
  </div>;
}

export default function AdminReviews() {
  const [data, setData] = useState(EMPTY_DATA);
  const [filterWords, setFilterWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtersError, setFiltersError] = useState(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [sort, setSort] = useState("RECENT");
  const [reviewPage, setReviewPage] = useState(1);
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [filterDraft, setFilterDraft] = useState("");
  const [filterWholeWord, setFilterWholeWord] = useState(true);
  const [editingFilter, setEditingFilter] = useState(null);
  const [requestResponses, setRequestResponses] = useState({});
  const requestSequence = useRef(0);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your Admin session has expired. Please sign in again.");
    return session;
  };

  const fetchReviews = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const session = await getSession();
      const params = new URLSearchParams({ search, reviewState: reviewFilter, sort, reviewPage: String(reviewPage) });
      const response = await fetch(`/api/admin/reviews?${params.toString()}`, { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Review data is unavailable.");
      if (sequence === requestSequence.current) setData(payload);
    } catch (loadError) {
      if (sequence !== requestSequence.current) return;
      setData(EMPTY_DATA);
      setError(loadError.message || "Review data is unavailable.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [reviewPage, reviewFilter, search, sort]);

  const fetchFilterWords = useCallback(async () => {
    try {
      const session = await getSession();
      const response = await fetch("/api/admin/review-filters", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Filter settings are unavailable.");
      setFilterWords(payload.words || []);
      setFiltersError(null);
    } catch (loadError) {
      setFiltersError(loadError.message || "Filter settings are unavailable.");
    }
  }, []);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);
  useEffect(() => { fetchFilterWords(); }, [fetchFilterWords]);

  const updateReviewVisibility = async (review, hidden) => {
    if (hidden && !window.confirm("Hide only this written comment from the shop? The star rating will remain visible.")) return;
    const key = `review-${review.review_id}`;
    setActionLoading((current) => ({ ...current, [key]: true }));
    try {
      const session = await getSession();
      const response = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          reviewType: review.review_type,
          reviewId: review.review_id,
          orderId: review.order_id,
          hidden,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to update review visibility.");
      showToast(hidden ? "Comment hidden. The star rating remains visible." : "Comment restored.");
      await fetchReviews();
    } catch (actionError) {
      showToast(actionError.message || "Failed to update review visibility.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const moderateRequest = async (requestRow, status) => {
    if (!window.confirm(status === "APPROVED" ? "Approve this request and hide only the written comment? The star rating will remain visible." : "Reject this request and keep the comment visible?")) return;
    const key = `request-${requestRow.id}`;
    setActionLoading((current) => ({ ...current, [key]: true }));
    try {
      const session = await getSession();
      const response = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "MODERATE_REQUEST", requestId: requestRow.id, status, response: requestResponses[requestRow.id] || "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not moderate this request.");
      showToast(status === "APPROVED" ? "Comment hidden; star rating remains visible." : "Request rejected; comment remains visible.");
      await fetchReviews();
    } catch (actionError) {
      showToast(actionError.message || "Could not moderate this request.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const saveFilterWord = async (event) => {
    event.preventDefault();
    const word = normalizeFilterWord(editingFilter?.word || filterDraft);
    if (word.length < 2) return;
    const isEditing = Boolean(editingFilter);
    const body = { word, matchWholeWord: filterWholeWord, isEnabled: editingFilter?.is_enabled !== false };
    setActionLoading((current) => ({ ...current, filter: true }));
    try {
      const session = await getSession();
      const response = await fetch("/api/admin/review-filters", { method: isEditing ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(isEditing ? { ...body, id: editingFilter.id } : body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save the filter word.");
      setFilterDraft(""); setEditingFilter(null); setFilterWholeWord(true); await fetchFilterWords(); showToast("Offensive-word filter saved.");
    } catch (actionError) {
      showToast(actionError.message || "Could not save the filter word.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, filter: false }));
    }
  };

  const toggleFilterWord = async (wordRow) => {
    try {
      const session = await getSession();
      const response = await fetch("/api/admin/review-filters", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id: wordRow.id, word: wordRow.word, matchWholeWord: wordRow.match_whole_word, isEnabled: !wordRow.is_enabled }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update the filter word.");
      await fetchFilterWords();
    } catch (actionError) {
      showToast(actionError.message || "Could not update the filter word.", "error");
    }
  };

  const deleteFilterWord = async (wordRow) => {
    if (!window.confirm(`Remove “${wordRow.word}” from the review filter?`)) return;
    try {
      const session = await getSession();
      const response = await fetch(`/api/admin/review-filters?id=${encodeURIComponent(wordRow.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not remove the filter word.");
      await fetchFilterWords(); showToast("Offensive-word filter removed.");
    } catch (actionError) {
      showToast(actionError.message || "Could not remove the filter word.", "error");
    }
  };

  const totals = data.totals || EMPTY_DATA.totals;
  const reviewPagination = data.reviewPagination || EMPTY_DATA.reviewPagination;

  if (loading && data.reviews.length === 0) return <main className="admin-page flex min-h-screen items-center justify-center bg-[#F6F6F2] font-sans text-slate-600"><div className="flex flex-col items-center gap-3"><Loader2 size={36} className="animate-spin text-[#EC008C]" /><p className="text-xs font-semibold uppercase tracking-wider">Loading reviews...</p></div></main>;
  if (error && data.reviews.length === 0) return <main className="admin-page flex min-h-screen items-center justify-center bg-[#F6F6F2] px-6 font-sans text-slate-900"><div className="w-full max-w-md border border-rose-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 text-[#EC008C]" size={34} /><h1 className="text-xl font-black">Reviews unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={fetchReviews} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#EC008C]"><RefreshCcw size={14} /> Retry</button></div></main>;

  return <main className="admin-page min-h-screen bg-[#F6F6F2] pb-24 font-sans text-slate-900">
    <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</p><h1 className="text-3xl font-black uppercase tracking-tight">Reviews</h1><p className="mt-2 max-w-2xl text-xs text-white/65">Preview every customer review in one list. Approving a hide request removes only the written comment; star ratings remain in the shop.</p></div><div className="flex items-center gap-3 bg-white/5 px-3 py-2"><div className="text-center"><p className="text-xl font-black">{totals.averageRating || "0.0"}</p><div className="flex justify-center text-[#FFF200]" aria-label={`${totals.averageRating || "0.0"} average rating`}><Star size={12} className="fill-[#FFF200]" /></div></div><div className="border-l border-white/15 pl-3 text-[11px] text-white/65"><p>{totals.total || 0} total reviews</p><p>{totals.visible || 0} comments visible</p><p>{totals.hidden || 0} comments hidden</p></div></div></div></section>
    {toast && <div className={`fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status" aria-live="polite">{toast.message}</div>}
    <section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
      <section className="mb-6 border border-[#D8D6CE] bg-white p-4" aria-labelledby="review-filter-settings"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Admin-only settings</p><h2 id="review-filter-settings" className="mt-1 text-lg font-black">Offensive-word filter</h2></div><p className="max-w-md text-[10px] leading-relaxed text-slate-500">Words are private to Admins. Original review text is preserved; customer-facing comments replace matched words with <strong>****</strong>.</p></div>{filtersError && <div className="mt-3 flex items-center justify-between border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">{filtersError}<button type="button" onClick={fetchFilterWords} className="font-black underline">Retry</button></div>}<form onSubmit={saveFilterWord} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{editingFilter ? "Edit filtered word" : "Add filtered word"}<input value={editingFilter ? editingFilter.word : filterDraft} onChange={(event) => editingFilter ? setEditingFilter((current) => ({ ...current, word: event.target.value })) : setFilterDraft(event.target.value)} minLength={2} maxLength={80} required placeholder="Enter a word" className="mt-1 block w-full border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-[#00C7C7]" /></label><label className="flex items-center gap-2 border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-700"><input type="checkbox" checked={filterWholeWord} onChange={(event) => setFilterWholeWord(event.target.checked)} className="h-4 w-4 accent-[#00C7C7]" /> Whole word only</label><button type="submit" disabled={actionLoading.filter} className="bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white hover:bg-[#EC008C] disabled:opacity-40">{editingFilter ? "Save edit" : "Add word"}</button>{editingFilter && <button type="button" onClick={() => { setEditingFilter(null); setFilterDraft(""); setFilterWholeWord(true); }} className="border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">Cancel</button>}</form><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{filterWords.length === 0 ? <p className="text-xs text-slate-500">No filter words configured yet.</p> : filterWords.map((wordRow) => <div key={wordRow.id} className="flex items-center justify-between gap-3 border border-slate-200 bg-[#F6F6F2] px-3 py-2.5"><div className="min-w-0"><p className={`truncate text-xs font-black ${wordRow.is_enabled ? "text-slate-900" : "text-slate-400 line-through"}`}>{wordRow.word}</p><p className="text-[10px] text-slate-500">{wordRow.match_whole_word ? "Whole word" : "Anywhere"} · preview: {maskReviewText(`Example ${wordRow.word} review`, [wordRow])}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => { setEditingFilter(wordRow); setFilterWholeWord(wordRow.match_whole_word); }} className="px-2 py-1 text-[10px] font-bold text-[#008F91] hover:bg-white">Edit</button><button type="button" onClick={() => toggleFilterWord(wordRow)} className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-white">{wordRow.is_enabled ? "Disable" : "Enable"}</button><button type="button" onClick={() => deleteFilterWord(wordRow)} aria-label={`Remove ${wordRow.word} filter`} className="rounded p-1 text-rose-600 hover:bg-rose-50"><X size={13} /></button></div></div>)}</div></section>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Review totals"><div className="border-l-4 border-[#00C7C7] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">All reviews</p><p className="mt-1 text-xl font-black">{totals.total || 0}</p></div><div className="border-l-4 border-emerald-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Comments visible</p><p className="mt-1 text-xl font-black">{totals.visible || 0}</p></div><div className="border-l-4 border-rose-400 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Comments hidden</p><p className="mt-1 text-xl font-black">{totals.hidden || 0}</p></div><div className="border-l-4 border-[#FFF200] bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pending requests</p><p className="mt-1 text-xl font-black">{data.moderationSummary?.pending || 0}</p></div></div>
      <div className="mb-4 border border-slate-200 bg-white p-4" aria-label="Review filters"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#008F91]">Review filters</p><p className="mt-1 text-xs text-slate-500">Choose which reviews or comment requests to preview.</p></div>{reviewFilter !== "ALL" && <button type="button" onClick={() => { setReviewFilter("ALL"); setReviewPage(1); }} className="text-[11px] font-black text-[#A90063] underline">Clear filter</button>}</div><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">{[{ value: "ALL", label: "All reviews", count: totals.total || 0, description: "Every rating and comment" }, { value: "PENDING", label: "Pending requests", count: data.moderationSummary?.pending || 0, description: "Waiting for Admin action" }, { value: "HIDDEN", label: "Hidden comments", count: totals.hidden || 0, description: "Stars still remain visible" }, { value: "VISIBLE", label: "Visible comments", count: totals.visible || 0, description: "Public written comments" }].map((filter) => <button type="button" key={filter.value} aria-pressed={reviewFilter === filter.value} onClick={() => { setReviewFilter(filter.value); setReviewPage(1); }} className={`flex min-h-[78px] flex-col items-start justify-between border p-3 text-left transition ${reviewFilter === filter.value ? "border-[#EC008C] bg-[#FFF0F8] ring-1 ring-[#EC008C]" : "border-slate-200 bg-slate-50 hover:border-[#00C7C7] hover:bg-white"}`}><span className="flex w-full items-center justify-between gap-2"><span className="text-[11px] font-black text-slate-800">{filter.label}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-900 shadow-sm">{filter.count}</span></span><span className="mt-2 text-[10px] leading-relaxed text-slate-500">{filter.description}</span></button>)}</div></div>
      <div className="mb-5 grid grid-cols-1 gap-3 border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_200px]"><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Search shops, owners, customers, or text<span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setReviewPage(1); }} placeholder="Search all reviews..." aria-label="Search shops, owners, customers, or review text" className="w-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:border-[#00C7C7] focus:bg-white" /></span></label><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Sort<select value={sort} onChange={(event) => { setSort(event.target.value); setReviewPage(1); }} className="mt-1 w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700"><option value="RECENT">Most recent</option><option value="HIGHEST">Highest rated</option><option value="LOWEST">Lowest rated</option></select></label></div>
      {error && <div className="mb-4 flex items-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800" role="alert"><AlertCircle size={16} /> {error}<button type="button" onClick={fetchReviews} className="ml-auto font-black underline">Retry</button></div>}
      <section aria-labelledby="all-reviews-heading"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#008F91]">Review directory</p><h2 id="all-reviews-heading" className="mt-1 text-lg font-black">All customer reviews</h2></div><p className="text-right text-[10px] text-slate-500">{reviewPagination.totalItems || 0} reviews</p></div>{data.reviews.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center"><CheckCircle2 size={30} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-700">No reviews found</p><p className="mt-1 text-xs text-slate-500">Try another search or review filter.</p></div> : <div className="grid gap-3 md:grid-cols-2">{data.reviews.map((review) => <ReviewCard key={`${review.review_type}-${review.review_id}`} review={review} actionLoading={actionLoading} updateReviewVisibility={updateReviewVisibility} requestResponses={requestResponses} setRequestResponses={setRequestResponses} moderateRequest={moderateRequest} />)}</div>}<div className="mt-4"><Pager pagination={reviewPagination} onPageChange={setReviewPage} /></div></section>
    </section>
  </main>;
}
