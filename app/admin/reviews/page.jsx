"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Star, Loader2, User, Store,
  Calendar, Hash, AlertTriangle, Eye, EyeOff, RefreshCcw, CheckCircle, ShieldCheck
} from "lucide-react";

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [hiddenReviews, setHiddenReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0);
  const [tab, setTab] = useState("active");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function loadReviews() {
      const { data, error } = await supabase
        .from("business_reviews")
        .select(`
          order_id,
          business_id,
          rating,
          feedback,
          feedback_hidden,
          feedback_hidden_at,
          feedback_hidden_by,
          created_at,
          customer_name,
          item_name,
          businesses ( name )
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setReviews(data.filter(r => !r.feedback_hidden));
        setHiddenReviews(data.filter(r => r.feedback_hidden));
      }
      setLoading(false);
    }
    loadReviews();
  }, []);

  const restoreReview = async (orderId) => {
    const { error } = await supabase
      .from("orders")
      .update({ feedback_hidden: false, feedback_hidden_at: null, feedback_hidden_by: null })
      .eq("id", orderId);

    if (!error) {
      const restored = hiddenReviews.find(r => r.order_id === orderId);
      setHiddenReviews(prev => prev.filter(r => r.order_id !== orderId));
      if (restored) setReviews(prev => [{ ...restored, feedback_hidden: false }, ...prev]);
      showToast("Review restored to shop profile.");
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const displayed = tab === "active" ? reviews : hiddenReviews;
  const filtered = filterRating === 0 ? displayed : displayed.filter(r => r.rating === filterRating);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0.0";

  if (loading) {
    return (
      <main className="admin-page min-h-screen bg-[#F6F6F2] flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading reviews...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-24">
      
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-[#1A1A1A] border-b border-white/10 py-8 px-4 text-white sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Review moderation</h1>
            <p className="mt-2 text-xs text-white/65">Oversee customer feedback across all print shops and enforce review standards.</p>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="text-center px-2">
              <span className="text-2xl font-extrabold text-slate-900">{avgRating}</span>
              <div className="flex items-center text-amber-400 justify-center">
                <Star size={12} className="fill-amber-400" />
              </div>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <p className="text-xs font-bold text-slate-900">{reviews.length} Active</p>
              <p className="text-[11px] text-slate-400">{hiddenReviews.length} Hidden</p>
            </div>
          </div>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}

      {/* Main Container */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => setTab("active")}
              className={`pb-3 text-xs font-bold transition-all relative ${
                tab === "active" ? "text-slate-900 border-b-2 border-[#EC008C]" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Active Public Reviews ({reviews.length})
            </button>
            <button
              onClick={() => setTab("hidden")}
              className={`pb-3 text-xs font-bold transition-all relative ${
                tab === "hidden" ? "text-slate-900 border-b-2 border-[#EC008C]" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Hidden Reviews ({hiddenReviews.length})
            </button>
          </div>

          <div className="flex items-center gap-1 bg-white p-1.5 border border-slate-200 rounded-xl">
            <span className="text-xs font-semibold text-slate-500 px-2">Filter Rating:</span>
            {[0, 5, 4, 3, 2, 1].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRating(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  filterRating === r ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {r === 0 ? "All" : `${r}★`}
              </button>
            ))}
          </div>
        </div>

        {/* Reviews List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400 font-medium">
            No reviews found under this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((r) => (
              <div key={r.order_id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{r.customer_name || "Customer"}</span>
                    <span className="text-xs text-slate-400">reviewed</span>
                    <span className="font-bold text-xs text-slate-800">{r.businesses?.name || "Shop"}</span>
                    <div className="flex items-center gap-0.5 text-amber-400 ml-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} size={14} className={star <= r.rating ? "fill-amber-400" : "text-slate-200"} />
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed italic">
                    "{r.feedback || "No written comment provided."}"
                  </p>

                  <p className="text-[11px] text-slate-400">
                    Order ID: #{r.order_id?.split('-')[0].toUpperCase()} • {new Date(r.created_at).toLocaleDateString()}
                    {r.feedback_hidden_by && <span className="ml-2 font-semibold text-amber-600">(Hidden by {r.feedback_hidden_by})</span>}
                  </p>
                </div>

                {tab === "hidden" && (
                  <div>
                    <button
                      onClick={() => restoreReview(r.order_id)}
                      className="px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      <Eye size={14} /> Restore to Public
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </section>

    </main>
  );
}
