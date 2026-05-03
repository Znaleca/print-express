"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Star, Loader2, User,
  Calendar, Hash, AlertTriangle, Eye, EyeOff, RefreshCcw, CheckCircle, Store
} from "lucide-react";
import Link from "next/link";

export default function OwnerReviews() {
  const [reviews, setReviews] = useState([]);
  const [hiddenReviews, setHiddenReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0);
  const [tab, setTab] = useState("active"); // "active" | "hidden"
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
        } else {
          console.error(error);
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
      showToast("Review hidden from public view.");
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
      showToast("Review restored and visible to public.");
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
    : "—";

  const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct: reviews.length > 0
      ? Math.round((reviews.filter((r) => r.rating === star).length / reviews.length) * 100)
      : 0,
  }));

  const starColor = ["#EC008C", "#00FFFF", "#FFF200", "#FFF200", "#00FFFF"];

  if (!loading && !business) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-[#FDFDFD] min-h-[50vh]">
        <Store size={48} className="mb-4 text-gray-300" />
        <p className="font-mono text-sm uppercase font-black opacity-30">No_Business_Node_Found</p>
        <Link href="/owner/onboarding" className="mt-4 px-4 py-2 bg-[#1A1A1A] text-[#00FFFF] font-black uppercase text-[10px] tracking-widest border-2 border-[#1A1A1A]">
          Initialize Business Node
        </Link>
      </div>
    );
  }

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden font-sans min-h-screen">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Owner_Portal // Review_Management
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                Unit_<span className="bg-[#1A1A1A] px-4 py-1 text-[#00FFFF] not-italic">Feedback</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Monitor client signals, moderate reviews, and maintain your unit's performance metrics.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Unit Snapshot</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">Avg // {avgRating}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <Star className="h-6 w-6 text-[#FFF200]" />
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                <div className="h-1 flex-1 bg-[#00FFFF]" />
                <div className="h-1 flex-1 bg-[#EC008C]" />
                <div className="h-1 flex-1 bg-[#FFF200]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <MessageSquare size={14} className="text-white" />
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1920px] px-6 py-10 md:px-10 md:py-14">

        {/* STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white border-4 border-[#1A1A1A] p-5 shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
            <p className="font-mono text-[9px] uppercase font-black opacity-50 mb-1">Active Reviews</p>
            <p className="text-3xl font-black italic">{reviews.length}</p>
          </div>
          <div className="bg-white border-4 border-[#1A1A1A] p-5 shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <p className="font-mono text-[9px] uppercase font-black opacity-50 mb-1">Avg Rating</p>
            <p className="text-3xl font-black italic text-[#EC008C]">{avgRating}</p>
          </div>
          <div className="bg-white border-4 border-[#1A1A1A] p-5 shadow-[6px_6px_0px_0px_rgba(255,242,0,1)]">
            <p className="font-mono text-[9px] uppercase font-black opacity-50 mb-1">5-Star Reviews</p>
            <p className="text-3xl font-black italic text-[#1A1A1A]">
              {reviews.filter((r) => r.rating === 5).length}
            </p>
          </div>
          <div className="bg-[#1A1A1A] border-4 border-[#1A1A1A] p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.3)]">
            <p className="font-mono text-[9px] uppercase font-black text-white/70 mb-1">Hidden Feedback</p>
            <p className="text-3xl font-black italic text-white">
              {hiddenReviews.length}
            </p>
          </div>
        </div>

        {/* TOAST */}
        {toast && (
          <div className="mb-6 bg-[#FFF200] text-[#1A1A1A] px-4 py-3 font-mono text-[10px] font-black uppercase border-2 border-[#1A1A1A] flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
            <CheckCircle size={14} /> {toast}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          {/* SIDEBAR */}
          <div className="lg:col-span-1 space-y-4">
            {/* Tab switcher */}
            <div className="bg-white border-4 border-[#1A1A1A] overflow-hidden shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
              <div className="bg-[#1A1A1A] text-white px-5 py-4 flex items-center gap-3 border-b-4 border-[#1A1A1A]">
                <EyeOff size={16} className="text-[#00FFFF]" />
                <h2 className="font-black uppercase italic tracking-widest text-sm">View_Mode</h2>
              </div>
              <div className="p-4 space-y-2">
                <button
                  onClick={() => setTab("active")}
                  className={`w-full text-left font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-2 transition-all flex items-center gap-2 ${tab === "active" ? "bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]" : "bg-white text-[#1A1A1A] border-[#1A1A1A]/20 hover:border-[#1A1A1A]"}`}
                >
                  <Eye size={12} /> Active ({reviews.length})
                </button>
                <button
                  onClick={() => setTab("hidden")}
                  className={`w-full text-left font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-2 transition-all flex items-center gap-2 ${tab === "hidden" ? "bg-[#EC008C] text-white border-[#EC008C]" : "bg-white text-[#EC008C] border-[#EC008C]/40 hover:border-[#EC008C]"}`}
                >
                  <EyeOff size={12} /> Hidden ({hiddenReviews.length})
                </button>
              </div>
            </div>

            {/* Rating dist (active tab only) */}
            {tab === "active" && (
              <div className="bg-white border-4 border-[#1A1A1A] overflow-hidden shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
                <div className="bg-[#1A1A1A] text-white px-5 py-4 flex items-center gap-3 border-b-4 border-[#1A1A1A]">
                  <Star size={16} className="text-[#FFF200]" />
                  <h2 className="font-black uppercase italic tracking-widest text-sm">Rating_Dist</h2>
                </div>
                <div className="p-5 space-y-3">
                  <button onClick={() => setFilterRating(0)} className={`w-full text-left font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-2 transition-all ${filterRating === 0 ? "bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]" : "bg-white text-[#1A1A1A] border-[#1A1A1A]/20 hover:border-[#1A1A1A]"}`}>
                    All Ratings
                  </button>
                  {ratingDist.map(({ star, count, pct }) => (
                    <button key={star} onClick={() => setFilterRating(star)} className={`w-full text-left border-2 px-3 py-3 transition-all ${filterRating === star ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white border-[#1A1A1A]/20 hover:border-[#1A1A1A]"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} size={10} fill={s <= star ? (filterRating === star ? "#FFF200" : "#1A1A1A") : "none"} className={s <= star ? (filterRating === star ? "text-[#FFF200]" : "text-[#1A1A1A]") : "text-gray-300"} />
                          ))}
                        </div>
                        <span className="font-mono text-[10px] font-black opacity-60">{count}</span>
                      </div>
                      <div className="w-full bg-gray-200 h-1">
                        <div className="h-1 transition-all duration-500" style={{ width: `${pct}%`, background: starColor[star - 1] }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* REVIEWS LIST */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-3 bg-[#1A1A1A] text-white px-4 py-2 italic">
                <MessageSquare size={16} className="text-[#00FFFF]" />
                <h2 className="font-black uppercase text-sm tracking-widest">
                  {tab === "hidden" ? "Hidden_Reviews" : "Feedback_Stream"}
                </h2>
              </div>
              <span className="font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-4 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
                {filtered.length} ENTRIES
              </span>
            </div>

            {tab === "hidden" && hiddenReviews.length > 0 && (
              <div className="mb-6 bg-[#EC008C]/10 border-2 border-[#EC008C] px-4 py-3 font-mono text-[10px] uppercase font-black text-[#EC008C] flex items-center gap-2">
                <AlertTriangle size={14} />
                These reviews are hidden from your public business page. You can restore them if desired.
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 bg-white border-4 border-[#1A1A1A]">
                <Loader2 size={40} className="animate-spin mb-4 text-[#00FFFF]" />
                <p className="font-mono text-[10px] uppercase tracking-widest font-black opacity-50">Scanning_Feedback_Nodes...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 bg-white border-4 border-dashed border-[#1A1A1A]/20">
                <AlertTriangle size={48} className="mb-4 text-gray-300" />
                <p className="font-mono text-sm uppercase font-black opacity-30">Null_Sequence_Detected</p>
              </div>
            ) : (
              <div className="space-y-6">
                {filtered.map((review) => (
                  <div
                    key={review.order_id}
                    className={`border-4 border-[#1A1A1A] overflow-hidden ${review.feedback_hidden ? "bg-red-50 shadow-[8px_8px_0px_0px_rgba(236,0,140,0.3)]" : "bg-white shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]"}`}
                  >
                    {/* Status strip */}
                    <div className={`px-6 py-2 border-b-4 border-[#1A1A1A] flex justify-between items-center ${review.feedback_hidden ? "bg-[#EC008C]" : "bg-[#F9F9F7]"}`}>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} size={14} fill={s <= review.rating ? (review.feedback_hidden ? "#FFF200" : "#1A1A1A") : "none"} className={s <= review.rating ? (review.feedback_hidden ? "text-[#FFF200]" : "text-[#1A1A1A]") : "text-gray-300"} />
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        {review.feedback_hidden && (
                          <span className="font-mono text-[9px] font-black uppercase tracking-widest text-white">
                            Hidden by {review.feedback_hidden_by || "owner"}
                          </span>
                        )}
                        <span className="font-mono text-[9px] font-black uppercase tracking-[0.3em] px-2 py-1 border-2"
                          style={{
                            background: review.rating >= 4 ? "#FFF200" : review.rating === 3 ? "#00FFFF" : "#EC008C",
                            color: review.rating < 3 ? "white" : "#1A1A1A",
                            borderColor: "#1A1A1A",
                          }}
                        >
                          {review.rating >= 4 ? "POSITIVE" : review.rating === 3 ? "NEUTRAL" : "NEGATIVE"} // {review.rating}/5
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x-4 divide-[#1A1A1A]">
                      {/* Main feedback */}
                      <div className="flex-1 p-6">
                        {review.item_name && (
                          <div className="mb-3">
                            <span className="font-mono text-[8px] uppercase font-black px-2 py-1 bg-[#1A1A1A] text-[#FFF200]">{review.item_name}</span>
                          </div>
                        )}
                        <p className="font-mono text-sm uppercase leading-loose font-bold tracking-wide text-[#1A1A1A] mb-4">
                          {review.feedback
                            ? `"${review.feedback}"`
                            : <span className="opacity-30 italic">No written feedback provided.</span>
                          }
                        </p>

                        {/* Owner controls */}
                        <div className="flex gap-3 mt-4 pt-4 border-t-2 border-dashed border-[#1A1A1A]/20">
                          {review.feedback_hidden ? (
                             <button
                               onClick={() => restoreReview(review.order_id)}
                               className="flex items-center gap-2 px-4 py-2 bg-[#00FFFF] text-[#1A1A1A] border-2 border-[#1A1A1A] font-black text-[9px] uppercase hover:bg-[#FFF200] transition-all shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:shadow-none"
                             >
                               <RefreshCcw size={12} /> Restore Review
                             </button>
                          ) : (
                             <button
                               onClick={() => hideReview(review.order_id)}
                               className="flex items-center gap-2 px-4 py-2 bg-[#EC008C] text-white border-2 border-[#1A1A1A] font-black text-[9px] uppercase hover:bg-[#1A1A1A] transition-all shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:shadow-none"
                             >
                               <EyeOff size={12} /> Hide Review
                             </button>
                          )}
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="w-full md:w-[260px] bg-[#F9F9F7] p-6 space-y-4">
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-widest font-black opacity-40 mb-1">Customer</p>
                          <div className="flex items-center gap-2">
                            <User size={12} className="text-[#EC008C]" />
                            <p className="font-black uppercase italic text-sm">{review.customer_name || "ANON_USER"}</p>
                          </div>
                        </div>
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-widest font-black opacity-40 mb-1">Packet_Time</p>
                          <div className="flex items-center gap-2">
                            <Calendar size={12} className="text-[#FFF200] shrink-0" />
                            <p className="font-mono text-[10px] font-black">{new Date(review.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="pt-3 border-t-2 border-dashed border-[#1A1A1A]/20">
                          <p className="font-mono text-[8px] uppercase tracking-widest font-black opacity-40 mb-1">Order Ref</p>
                          <div className="flex items-center gap-2">
                            <Hash size={12} className="opacity-40" />
                            <p className="font-mono text-[9px] font-black opacity-60">{review.order_id.split("-")[0]}...</p>
                          </div>
                        </div>
                        {review.feedback_hidden_at && (
                          <div className="pt-3 border-t-2 border-dashed border-red-300">
                            <p className="font-mono text-[8px] uppercase tracking-widest font-black text-red-500 mb-1">Hidden At</p>
                            <p className="font-mono text-[9px] font-black text-red-400">{new Date(review.feedback_hidden_at).toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
