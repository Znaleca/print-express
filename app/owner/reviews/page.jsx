"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Star, Loader2, User,
  Calendar, Hash, AlertTriangle, Eye, EyeOff, RefreshCcw, CheckCircle, Store, StarHalf
} from "lucide-react";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import Link from "next/link";

export default function OwnerReviews() {
  const [reviews, setReviews] = useState([]);
  const [hiddenReviews, setHiddenReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0);
  const [tab, setTab] = useState("active");
  const [toast, setToast] = useState(null);
  const [business, setBusiness] = useState(null);

  useEffect(() => {
    async function loadReviews() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz) {
        setBusiness(biz);
        const { data, error } = await supabase
          .from("business_reviews")
          .select(`
            order_id,
            rating,
            feedback,
            feedback_hidden,
            feedback_hidden_at,
            feedback_hidden_by,
            created_at,
            customer_name,
            item_name
          `)
          .eq("business_id", biz.id)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setReviews(data.filter(r => !r.feedback_hidden));
          setHiddenReviews(data.filter(r => r.feedback_hidden));
        }
      }
      setLoading(false);
    }
    loadReviews();
  }, []);

  const hideReview = async (orderId) => {
    const { error } = await supabase
      .from("orders")
      .update({
        feedback_hidden: true,
        feedback_hidden_at: new Date().toISOString(),
        feedback_hidden_by: "owner",
      })
      .eq("id", orderId);

    if (!error) {
      const hidden = reviews.find(r => r.order_id === orderId);
      setReviews(prev => prev.filter(r => r.order_id !== orderId));
      if (hidden) {
        setHiddenReviews(prev => [
          { ...hidden, feedback_hidden: true, feedback_hidden_by: "owner", feedback_hidden_at: new Date().toISOString() },
          ...prev
        ]);
      }
      showToast("Review hidden from shop profile.");
    }
  };

  const restoreReview = async (orderId) => {
    const { error } = await supabase
      .from("orders")
      .update({ feedback_hidden: false, feedback_hidden_at: null, feedback_hidden_by: null })
      .eq("id", orderId);

    if (!error) {
      const restored = hiddenReviews.find(r => r.order_id === orderId);
      setHiddenReviews(prev => prev.filter(r => r.order_id !== orderId));
      if (restored) {
        setReviews(prev => [{ ...restored, feedback_hidden: false }, ...prev]);
      }
      showToast("Review restored to shop profile.");
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const currentList = tab === "active" ? reviews : hiddenReviews;
  const filteredList = filterRating > 0
    ? currentList.filter(r => Number(r.rating) === filterRating)
    : currentList;

  const totalReviews = reviews.length + hiddenReviews.length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1)
    : "0.0";

  if (loading) {
    return <OwnerPageSkeleton rows={3} />;
  }

  return (
    <main className="owner-reviews-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-20">
      
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-8 text-white sm:px-8 sm:pb-11 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Reviews</h1>
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Stay close to customer feedback and control which reviews are visible on your shop profile.</p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
            <div className="text-center px-2">
              <span className="text-2xl font-extrabold text-white">{avgRating}</span>
              <div className="flex items-center text-amber-400 justify-center">
                <Star size={12} className="fill-amber-400" />
              </div>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <p className="text-xs font-bold text-white">{reviews.length} Published</p>
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
              Published Reviews ({reviews.length})
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
        {filteredList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400 font-medium">
            No reviews found under this view.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredList.map((r) => (
              <div key={r.order_id} className="flex flex-col justify-between gap-4 rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm sm:flex-row sm:items-start">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{r.customer_name || "Verified Customer"}</span>
                    <div className="flex items-center gap-0.5 text-amber-400">
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
                  </p>
                </div>

                <div>
                  {tab === "active" ? (
                    <button
                      onClick={() => hideReview(r.order_id)}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 flex items-center gap-1.5"
                    >
                      <EyeOff size={14} /> Hide Review
                    </button>
                  ) : (
                    <button
                      onClick={() => restoreReview(r.order_id)}
                      className="px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      <Eye size={14} /> Restore Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </section>

    </main>
  );
}
