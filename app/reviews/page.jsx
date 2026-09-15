"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Package, RefreshCcw, Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CustomerReviewsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [toast, setToast] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to view your purchases and reviews.");
      const response = await fetch("/api/customer/reviews", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load review history.");
      setOrders(payload.orders || []);
      const nextDrafts = {};
      (payload.orders || []).forEach((order) => order.items.forEach((item) => {
        const key = `${order.order_id}:${item.service_id}`;
        nextDrafts[key] = { rating: item.review?.rating || 0, feedback: item.review?.feedback_masked || "" };
      }));
      setDrafts(nextDrafts);
    } catch (loadError) { setError(loadError.message || "Could not load review history."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const purchasedCount = useMemo(() => orders.reduce((count, order) => count + order.items.length, 0), [orders]);
  const reviewedCount = useMemo(() => orders.reduce((count, order) => count + order.items.filter((item) => item.review).length, 0), [orders]);

  const saveReview = async (order, item) => {
    const key = `${order.order_id}:${item.service_id}`;
    const draft = drafts[key] || {};
    if (!draft.rating) { setError("Choose a star rating first."); return; }
    setSavingKey(key); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/customer/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.order_id, serviceId: item.service_id, rating: draft.rating, feedback: draft.feedback || "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save this review.");
      setToast(item.review ? "Review updated." : "Review submitted.");
      window.setTimeout(() => setToast(""), 3000);
      await loadHistory();
    } catch (saveError) { setError(saveError.message || "Could not save this review."); }
    finally { setSavingKey(""); }
  };

  if (loading && orders.length === 0) return <main className="flex min-h-[70vh] items-center justify-center bg-[#F6F6F2]"><div className="text-center"><Loader2 className="mx-auto animate-spin text-[#EC008C]" size={34} /><p className="mt-3 text-xs font-black uppercase tracking-wider text-slate-500">Loading your purchases</p></div></main>;

  return <main className="min-h-screen bg-[#F6F6F2] pb-24 text-slate-900">
    <section className="relative overflow-hidden bg-[#1A1A1A] px-4 py-10 text-white sm:px-8"><div className="cmyk-bar absolute inset-x-0 top-0" /><div className="mx-auto max-w-6xl"><p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">Customer account</p><h1 className="mt-2 text-4xl font-black uppercase sm:text-6xl">Purchases &amp; Reviews</h1><p className="mt-3 max-w-2xl text-sm text-white/65">See everything you bought and rate each product or service separately.</p><div className="mt-6 flex gap-3 text-xs font-bold"><span className="bg-white/10 px-3 py-2">{purchasedCount} purchased items</span><span className="bg-white/10 px-3 py-2">{reviewedCount} reviewed</span></div></div></section>
    {toast && <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white" role="status">{toast}</div>}
    <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-8">
      {error && <div className="mb-5 flex items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800" role="alert"><span>{error}</span><button type="button" onClick={loadHistory} className="inline-flex items-center gap-1 font-black"><RefreshCcw size={13} /> Retry</button></div>}
      {orders.length === 0 ? <div className="border border-dashed border-slate-300 bg-white p-12 text-center"><Package className="mx-auto text-slate-300" size={38} /><h2 className="mt-3 text-lg font-black">No purchases yet</h2><p className="mt-1 text-xs text-slate-500">Completed and active orders will appear here.</p><Link href="/browse" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">Browse services</Link></div> : <div className="space-y-4">{orders.map((order) => <article key={order.order_id} className="border border-[#D8D6CE] bg-white shadow-sm"><button type="button" onClick={() => setExpanded((current) => ({ ...current, [order.order_id]: !current[order.order_id] }))} className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black">{order.shop_name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">{order.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-[11px] text-slate-500">Order #{order.order_id.split("-")[0].toUpperCase()} · {formatDate(order.ordered_at)} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</p></div>{expanded[order.order_id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{expanded[order.order_id] && <div className="divide-y divide-slate-200 border-t border-slate-200">{order.items.map((item) => { const key = `${order.order_id}:${item.service_id}`; const draft = drafts[key] || { rating: 0, feedback: "" }; return <section key={item.service_id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black">{item.name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.item_type === "product" ? "Product" : "Service"} · Quantity {item.quantity}</p></div>{item.review && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800"><CheckCircle2 size={12} /> Reviewed</span>}</div>{order.reviewable ? <div className="mt-4 max-w-2xl"><div className="flex items-center gap-1" aria-label={`Rating for ${item.name}`}>{[1,2,3,4,5].map((star) => <button key={star} type="button" onClick={() => setDrafts((current) => ({ ...current, [key]: { ...draft, rating: star } }))} aria-label={`${star} star${star === 1 ? "" : "s"}`}><Star size={22} className={star <= draft.rating ? "fill-[#FFF200] text-[#D1C500]" : "text-slate-300"} /></button>)}</div><textarea value={draft.feedback} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, feedback: event.target.value } }))} rows={3} maxLength={2000} placeholder="Share your experience with this item..." className="mt-3 w-full rounded-xl border border-slate-200 bg-[#F6F6F2] p-3 text-xs outline-none focus:border-[#EC008C]" /><button type="button" onClick={() => saveReview(order, item)} disabled={savingKey === key || !draft.rating} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-[#EC008C] disabled:opacity-50">{savingKey === key && <Loader2 size={14} className="animate-spin" />}{item.review ? "Update review" : "Submit review"}</button>{item.review?.feedback_hidden && <p className="mt-2 text-[10px] font-semibold text-amber-700">This review is hidden while it is under moderation.</p>}</div> : <p className="mt-3 text-xs text-slate-500">You can review this item after the order is completed.</p>}</section>; })}</div>}</article>)}</div>}
    </section>
  </main>;
}
