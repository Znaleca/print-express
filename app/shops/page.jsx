"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Star, Loader2, Store, ChevronRight, MapPin, ArrowRight } from "lucide-react";
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
          id, name, address, lat, lng, logo_url, is_open,
          services ( name, category, available )
        `)
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (bizError) {
        console.error("Error loading businesses:", {
          code: bizError.code,
          message: bizError.message,
          details: bizError.details,
          hint: bizError.hint,
        });
        setLoading(false);
        return;
      }

      const { data: reviewData, error: reviewError } = await supabase
        .from("business_reviews")
        .select("business_id, rating");
      if (reviewError) {
        console.warn("Reviews are temporarily unavailable:", {
          code: reviewError.code,
          message: reviewError.message,
          details: reviewError.details,
          hint: reviewError.hint,
        });
      }
      const reviewsByBusiness = (reviewData || []).reduce((map, review) => {
        map[review.business_id] = [...(map[review.business_id] || []), review];
        return map;
      }, {});

      const formatted = (bizData || []).map((b) => {
        const availableServices = (b.services || [])
          .filter(s => s.available)
          .map(s => s.name);

        const reviews = reviewsByBusiness[b.id] || [];
        const avgRating = reviews.length > 0
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : 5.0;

        return {
          id: b.id,
          name: b.name || "Print Shop",
          address: b.address || "Location unavailable",
          lat: b.lat == null ? null : parseFloat(b.lat),
          lng: b.lng == null ? null : parseFloat(b.lng),
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

  const mappedBusinesses = businesses.filter(
    (b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)
  );

  const filtered = mappedBusinesses.filter(
    (b) =>
      (
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
        b.address.toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
    <main className="shops-page min-h-screen bg-[#F6F6F2] pb-20 font-sans text-[#1A1A1A]">
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-10 pt-9 text-white sm:px-8 sm:pb-12 sm:pt-11 lg:px-12">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-5 left-8 hidden h-24 w-24 rotate-12 border border-[#EC008C]/30 sm:block" />

        <div className="relative mx-auto w-full max-w-[1800px]">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
              Print shops <span className="text-[#00FFFF]">near you.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
              Compare verified local partners, browse their available services, and choose the right shop for your next print order.
            </p>
          </div>

          <div className="relative mt-7 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" size={19} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shop, service, or area..."
              aria-label="Search mapped print shops"
              className="shops-search h-14 w-full rounded-full border border-white/25 bg-white/10 pl-12 pr-5 text-sm font-semibold text-white outline-none transition-all placeholder:text-white/45 focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/20 sm:text-base"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1800px] px-4 pt-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#EC008C]">Directory / mapped partners</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Choose your print shop.</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#676762]">
            <MapPin size={14} className="text-[#EC008C]" />
            {loading ? "Loading..." : `${filtered.length} shop${filtered.length === 1 ? "" : "s"} with map location`}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-[#D8D6CE] bg-white/60 py-24 text-xs font-bold text-[#676762]">
            <Loader2 className="mb-3 animate-spin text-[#EC008C]" size={34} />
            <p>Loading mapped print shops...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-[#D8D6CE] bg-white/60 p-12 text-center">
            <MapPin className="mx-auto mb-4 text-[#EC008C]" size={30} />
            <h3 className="text-lg font-black">No mapped shops found</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#676762]">
              Try another search, or check the browse map for verified partners with a saved location.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b, index) => (
              <article
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/business/${b.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") router.push(`/business/${b.id}`);
                }}
                className="group relative flex h-auto min-h-0 cursor-pointer flex-col overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-[#EC008C]/50 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#EC008C]/40"
              >
                <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />

                <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#ECECE8]">
                  {b.logo_url ? (
                    <Image src={b.logo_url} alt={`${b.name} banner`} width={960} height={480} priority={index === 0} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-[#00FFFF]">
                      <Store size={42} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/35 via-transparent to-transparent" />
                </div>

                <div className="flex min-h-0 flex-1 flex-col p-5 pt-4 lg:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black tracking-tight transition-colors group-hover:text-[#EC008C]">{b.name}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#676762]">
                        <MapPin size={12} className="shrink-0 text-[#EC008C]" />
                        <span className="truncate">{b.address}</span>
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${b.is_open ? "bg-emerald-100 text-emerald-700" : "bg-[#ECECE8] text-[#676762]"}`}>
                      {b.is_open ? "Open" : "Closed"}
                    </span>
                  </div>

                <div className="mt-3 flex items-center justify-between border-y border-[#ECECE8] py-2.5">
                  <div className="flex items-center gap-1 text-sm font-black">
                    <Star size={15} className="fill-[#FFF200] text-[#D6C900]" />
                    {b.rating.toFixed(1)}
                    <span className="text-xs font-medium text-[#676762]">({b.reviewCount} reviews)</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#676762]">
                    <MapPin size={12} className="text-[#00A5A5]" /> Mapped
                  </span>
                </div>

                <div className="mt-3 min-h-0">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#676762]">Available services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {b.services.length > 0 ? b.services.map((service, index) => (
                      <span key={index} className="rounded-full border border-[#D8D6CE] bg-[#F6F6F2] px-2.5 py-1 text-[10px] font-bold text-[#4E4E49]">
                        {service}
                      </span>
                    )) : (
                      <span className="text-xs text-[#676762]">Services available on request</span>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[#ECECE8] pt-3 text-xs font-black transition-colors group-hover:text-[#EC008C]">
                  <span>View shop catalog</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A] text-white transition-colors group-hover:bg-[#EC008C]">
                    <ArrowRight size={15} />
                  </span>
                </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
