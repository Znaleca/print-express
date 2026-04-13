"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Star, Loader2, User, Store,
  Calendar, Hash, AlertTriangle
} from "lucide-react";

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState(0); // 0 = all

  useEffect(() => {
    async function loadReviews() {
      // Join business_reviews view with businesses table to get business names
      const { data, error } = await supabase
        .from("business_reviews")
        .select(`
          order_id,
          business_id,
          rating,
          feedback,
          created_at,
          customer_name,
          businesses ( name )
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setReviews(data);
      } else {
        console.error(error);
      }
      setLoading(false);
    }
    loadReviews();
  }, []);

  const filtered = filterRating === 0
    ? reviews
    : reviews.filter((r) => r.rating === filterRating);

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

  return (
    <section className="text-[#1A1A1A] font-sans">
      {/* PAGE HEADER */}
      <header className="mb-10 border-b-8 border-[#1A1A1A] pb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1">
            <div className="w-4 h-1 bg-[#00FFFF]" />
            <div className="w-4 h-1 bg-[#EC008C]" />
            <div className="w-4 h-1 bg-[#FFF200]" />
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">Access_Level: 00</span>
        </div>
        <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-3">
          Global_Intel_Log
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
          Monitoring All Feedback Streams Across All Business Nodes
        </p>
      </header>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-white border-4 border-[#1A1A1A] p-5 shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]">
          <p className="font-mono text-[9px] uppercase font-black opacity-50 mb-1">Total Reviews</p>
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
          <p className="font-mono text-[9px] uppercase font-black text-white/40 mb-1">With Feedback</p>
          <p className="text-3xl font-black italic text-[#00FFFF]">
            {reviews.filter((r) => r.feedback).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* RATING BREAKDOWN SIDEBAR */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border-4 border-[#1A1A1A] overflow-hidden shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
            <div className="bg-[#1A1A1A] text-white px-5 py-4 flex items-center gap-3 border-b-4 border-[#1A1A1A]">
              <Star size={16} className="text-[#FFF200]" />
              <h2 className="font-black uppercase italic tracking-widest text-sm">Rating_Dist</h2>
            </div>
            <div className="p-5 space-y-3">
              <button
                onClick={() => setFilterRating(0)}
                className={`w-full text-left font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-2 transition-all ${filterRating === 0 ? "bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]" : "bg-white text-[#1A1A1A] border-[#1A1A1A]/20 hover:border-[#1A1A1A]"}`}
              >
                All Ratings
              </button>
              {ratingDist.map(({ star, count, pct }) => (
                <button
                  key={star}
                  onClick={() => setFilterRating(star)}
                  className={`w-full text-left border-2 px-3 py-3 transition-all ${filterRating === star ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white border-[#1A1A1A]/20 hover:border-[#1A1A1A]"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={10}
                          fill={s <= star ? (filterRating === star ? "#FFF200" : "#1A1A1A") : "none"}
                          className={s <= star ? (filterRating === star ? "text-[#FFF200]" : "text-[#1A1A1A]") : "text-gray-300"}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[10px] font-black opacity-60">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 h-1">
                    <div
                      className="h-1 transition-all duration-500"
                      style={{ width: `${pct}%`, background: starColor[star - 1] }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* REVIEWS LIST */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-3 bg-[#1A1A1A] text-white px-4 py-2 italic">
              <MessageSquare size={16} className="text-[#00FFFF]" />
              <h2 className="font-black uppercase text-sm tracking-widest">
                Feedback_Stream
              </h2>
            </div>
            <span className="font-mono text-[10px] font-black uppercase tracking-widest px-3 py-2 border-4 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
              {filtered.length} ENTRIES
            </span>
          </div>

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
                  className="bg-white border-4 border-[#1A1A1A] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] hover:-translate-y-1 transition-transform duration-200 group"
                >
                  {/* Status strip */}
                  <div className="px-6 py-2 bg-[#F9F9F7] border-b-4 border-[#1A1A1A] flex justify-between items-center">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={14}
                          fill={s <= review.rating ? "#1A1A1A" : "none"}
                          className={s <= review.rating ? "text-[#1A1A1A]" : "text-gray-200"}
                        />
                      ))}
                    </div>
                    <span
                      className="font-mono text-[9px] font-black uppercase tracking-[0.3em] px-2 py-1 border-2"
                      style={{
                        background: review.rating >= 4 ? "#FFF200" : review.rating === 3 ? "#00FFFF" : "#EC008C",
                        color: review.rating < 3 ? "white" : "#1A1A1A",
                        borderColor: "#1A1A1A",
                      }}
                    >
                      {review.rating >= 4 ? "POSITIVE" : review.rating === 3 ? "NEUTRAL" : "NEGATIVE"} // {review.rating}/5
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x-4 divide-[#1A1A1A]">
                    {/* Main feedback */}
                    <div className="flex-1 p-6">
                      <p className="font-mono text-sm uppercase leading-loose font-bold tracking-wide text-[#1A1A1A] mb-4">
                        {review.feedback
                          ? `"${review.feedback}"`
                          : <span className="opacity-30 italic">No written feedback provided.</span>
                        }
                      </p>
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
                        <p className="font-mono text-[8px] uppercase tracking-widest font-black opacity-40 mb-1">Business Node</p>
                        <div className="flex items-center gap-2">
                          <Store size={12} className="text-[#00FFFF]" />
                          <p className="font-black uppercase italic text-sm truncate">{review.businesses?.name || "UNKNOWN_UNIT"}</p>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
