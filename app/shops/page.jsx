"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Store, ChevronRight, MapPin, Printer } from "lucide-react";
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
          id, name, address, logo_url,
          services ( name, category, available ),
          business_reviews ( rating )
        `)
        .eq("status", "APPROVED")
        .not("lat", "is", null)
        .not("lng", "is", null);

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
          name: b.name || "UNNAMED_UNIT",
          address: b.address || "LOC_UNKNOWN",
          logo_url: b.logo_url,
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
    <main className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] font-sans overflow-x-hidden">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-14 md:px-10 md:py-16">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative w-full">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Shop_Directory // Discovery_Mode
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.92] md:text-7xl">
                All_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Shops</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Browse approved print providers, inspect available services, and jump directly into order setup.
              </p>

              <div className="mt-6 flex h-3 w-full max-w-sm">
                <div className="flex-1 bg-[#00FFFF]" />
                <div className="flex-1 bg-[#EC008C]" />
                <div className="flex-1 bg-[#FFF200]" />
                <div className="flex-1 bg-[#1A1A1A]" />
              </div>
            </div>

            <div className="w-full">
              <div className="relative group">
                <div className="absolute -inset-1 bg-[#EC008C] opacity-20 group-focus-within:opacity-40 transition-opacity" />
                <div className="relative flex items-center bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
                  <Search className="ml-4 text-[#1A1A1A]" size={24} />
                  <input
                    type="text"
                    className="w-full bg-transparent px-4 py-5 text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 focus:outline-none font-mono text-xs font-black uppercase tracking-widest"
                    placeholder="Search by name, service or location..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="flex w-full items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <Printer size={14} className="text-white" />
        </div>
      </div>

      {/* GRID SECTION */}
      <section className="w-full px-6 py-10 md:px-10 md:py-14">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 font-mono uppercase text-[12px] tracking-[0.3em] text-[#1A1A1A]">
            <Loader2 className="animate-spin mb-6 text-[#00FFFF]" size={64} strokeWidth={3} />
            <p className="bg-[#1A1A1A] text-white px-4 py-2">Compiling_Shop_Data...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 border-8 border-[#1A1A1A] bg-white shadow-[12px_12px_0px_0px_rgba(236,0,140,1)]">
            <Store className="text-[#1A1A1A] mb-4" size={64} />
            <p className="font-mono text-lg font-black uppercase tracking-widest">No matching shops found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filtered.map((b) => (
              <div
                key={b.id}
                onClick={() => router.push(`/business/${b.id}`)}
                className="group relative bg-white border-4 border-[#1A1A1A] hover:border-[#00FFFF] transition-all duration-300 cursor-pointer flex flex-col h-full hover:-translate-y-2 shadow-[10px_10px_0px_0px_rgba(26,26,26,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,255,255,1)]"
              >
                {/* BANNER LOGO SECTION */}
                <div className="relative h-48 w-full bg-[#1A1A1A] overflow-hidden border-b-4 border-[#1A1A1A] group-hover:border-[#00FFFF] transition-colors">
                  {b.logo_url ? (
                    <>
                      <img
                        src={b.logo_url}
                        alt={b.name}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] to-transparent opacity-60" />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white group-hover:text-[#00FFFF]">
                      <Store size={48} />
                      <span className="font-mono text-[10px] mt-2 uppercase tracking-[0.2em]">Asset_Missing</span>
                    </div>
                  )}
                  {/* Floating ID Tag */}
                  <div className="absolute top-4 left-4 bg-white border-2 border-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-black uppercase">
                    ID_{b.id.split('-')[0]}
                  </div>
                </div>

                <div className="p-8 flex flex-col flex-1">
                  <div className="mb-6">
                    <h2 className="text-4xl font-black uppercase italic leading-[0.9] text-[#1A1A1A] tracking-tighter">
                      {b.name}
                    </h2>
                  </div>

                  {/* ADDRESS */}
                  <div className="flex items-start gap-3 mb-8 pb-6 border-b-2 border-dashed border-[#1A1A1A]/20">
                    <MapPin size={18} className="shrink-0 text-[#EC008C]" />
                    <p className="font-mono text-[11px] uppercase tracking-wider leading-relaxed font-bold">
                      {b.address}
                    </p>
                  </div>

                  {/* SERVICES & FOOTER */}
                  <div className="mt-auto">
                    <div className="flex flex-wrap gap-2 mb-8">
                      {b.services.map((s, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[10px] px-3 py-1.5 border-2 border-[#1A1A1A] bg-white uppercase font-black tracking-tighter group-hover:bg-[#FFF200] transition-colors"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t-4 border-[#1A1A1A]">
                      <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] text-white italic">
                        <Star size={16} fill="#FFF200" className="text-[#FFF200]" />
                        <span className="font-black text-xl">{b.rating.toFixed(1)}</span>
                        <span className="font-mono text-[9px] opacity-50 not-italic">({b.reviewCount})</span>
                      </div>

                      <div className="flex items-center gap-2 text-[#1A1A1A] group-hover:text-[#00FFFF] transition-colors">
                        <span className="font-black uppercase tracking-widest text-[11px]">Visit_Shop</span>
                        <ChevronRight size={20} strokeWidth={3} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FOOTER STATUS */}
      <div className="mt-20 flex w-full flex-col items-center justify-between gap-6 border-t-4 border-[#1A1A1A] py-8 sm:flex-row">
        <span className="font-mono text-xs font-black uppercase tracking-[0.3em] bg-[#1A1A1A] text-white px-4 py-1">
          Active_Shops: {filtered.length}
        </span>
        <div className="flex gap-1">
          <div className="w-12 h-3 bg-[#00FFFF]" />
          <div className="w-12 h-3 bg-[#EC008C]" />
          <div className="w-12 h-3 bg-[#FFF200]" />
          <div className="w-12 h-3 bg-[#1A1A1A]" />
        </div>
      </div>
    </main>
  );
}