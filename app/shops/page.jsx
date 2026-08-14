"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Store, ChevronRight, MapPin, Printer, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function ShopsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBusinesses() {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          id, name, address, logo_url, is_open,
          services ( name, category, available ),
          business_reviews ( rating )
        `)
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (bizError) {
        console.error("Error loading businesses:", bizError);
        setLoading(false);
        return;
      }

      const formatted = (bizData || []).map((b) => {
        const availableServices = (b.services || [])
          .filter(s => s.available)
          .map(s => s.name);

        const reviews = b.business_reviews || [];
        const avgRating = reviews.length > 0
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : 5.0;

        return {
          id: b.id,
          name: b.name || "Print Shop",
          address: b.address || "Location unavailable",
          logo_url: b.logo_url,
          is_open: b.is_open ?? true,
          rating: parseFloat(avgRating),
          reviewCount: reviews.length,
          services: availableServices.slice(0, 5)
        };
      });

      setBusinesses(formatted);
      setLoading(false);
    }

    loadBusinesses();
  }, []);

  const filtered = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
      b.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      
      {/* Header Banner */}
      <section className="bg-white border-b border-slate-200 py-8 px-4 sm:px-6 lg:px-8 relative">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-[1600px] mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold mb-3">
            <ShieldCheck size={14} className="text-[#EC008C]" /> Verified Partner Directory
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Print Shop Directory
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Browse approved local print providers, explore available products and printing services, and place orders directly.
          </p>

          {/* Search Bar */}
          <div className="mt-5 max-w-2xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by shop name, service type, or address..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all shadow-sm"
            />
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-xs font-semibold text-slate-500">
            <Loader2 className="animate-spin mb-3 text-[#EC008C]" size={36} />
            <p>Loading directory of print shops...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm font-medium text-slate-500 max-w-md mx-auto">
            No print shops matched your search query. Try resetting your search terms.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filtered.map((b) => (
              <div
                key={b.id}
                onClick={() => router.push(`/business/${b.id}`)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 cursor-pointer flex flex-col justify-between group hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />

                <div>
                  {/* Shop Header */}
                  <div className="flex items-start gap-4 mb-4">
                    {b.logo_url ? (
                      <img
                        src={b.logo_url}
                        alt={b.name}
                        className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                        <Store size={22} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-[#EC008C] transition-colors">
                          {b.name}
                        </h2>
                        {!b.is_open ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider shrink-0">
                            CLOSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider shrink-0">
                            OPEN
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-1">
                        <MapPin size={12} className="shrink-0 text-slate-400" />
                        <span>{b.address}</span>
                      </p>

                      <div className="flex items-center gap-1 font-bold text-slate-900 text-xs mt-2">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        <span>{b.rating.toFixed(1)}</span>
                        <span className="text-slate-400 font-normal">({b.reviewCount} reviews)</span>
                      </div>
                    </div>
                  </div>

                  {/* Services badges */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Available Services</p>
                    <div className="flex flex-wrap gap-1.5">
                      {b.services.map((s, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900 group-hover:text-[#EC008C] transition-colors">
                  <span>View Shop Catalog</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </main>
  );
}
