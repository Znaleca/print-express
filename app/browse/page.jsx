"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, MapPin, SlidersHorizontal, LocateFixed, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getRatingStats, ratingLabel } from "@/lib/rating";
import { withTimeout } from "@/lib/withTimeout";

const estimateTravelMinutes = (distanceKm) => (
  distanceKm == null ? null : Math.max(1, Math.round(Number(distanceKm) * 2.5))
);

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-[#00FFFF] font-sans animate-pulse">
      <Loader2 className="animate-spin mb-4" size={36} />
      <p className="tracking-wider text-xs font-semibold uppercase">Loading Map View...</p>
    </div>
  ),
});

export default function BrowsePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("recommended");
  const [selectedId, setSelectedId] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mapSectionRef = useRef(null);

  const requestLocation = () => {
    if (!navigator.geolocation) return;

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setSelectedId(null);
        setSortMode("nearest");
        setLocationLoading(false);
      },
      () => {
        setUserLocation(null);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const haversineKm = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  useEffect(() => {
    async function loadBusinesses() {
      try {
        const { data: bizData, error: bizError } = await withTimeout(
          (signal) => supabase
            .from("businesses")
            .select(`
              id, name, address, lat, lng, logo_url, is_open,
              services ( name, category, available )
            `)
            .eq("status", "APPROVED")
            .order("created_at", { ascending: false })
            .range(0, 99)
            .abortSignal(signal),
          8000,
          "Loading verified print shops timed out. Please try again."
        );

        if (bizError) {
          console.error("Error loading businesses:", {
            code: bizError.code,
            message: bizError.message,
            details: bizError.details,
            hint: bizError.hint,
          });
          setLoadError("We could not load verified print shops right now. Please refresh and try again.");
          return;
        }

        // Keep reviews optional. Embedding the business_reviews view can fail when
        // PostgREST has not inferred a relationship for the view yet.
        const { data: reviewData, error: reviewError } = await withTimeout(
          (signal) => supabase
            .from("business_reviews")
            .select("business_id, rating")
            .range(0, 999)
            .abortSignal(signal),
          8000,
          "Loading shop ratings timed out."
        );
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
          const ratingStats = getRatingStats(reviews);

          return {
            id: b.id,
            name: b.name || "Print Shop",
            address: b.address || "Location unavailable",
            lat: b.lat == null ? null : parseFloat(b.lat),
            lng: b.lng == null ? null : parseFloat(b.lng),
            logo_url: b.logo_url,
            is_open: b.is_open ?? true,
            rating: ratingStats.average,
            reviewCount: ratingStats.count,
            serviceCount: availableServices.length,
            services: availableServices.slice(0, 3)
          };
        });

        setBusinesses(formatted);
      } catch (error) {
        console.error("Error loading print shops:", error);
        setLoadError(error.message || "We could not load verified print shops right now. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    }

    loadBusinesses();
  }, []);

  const filtered = useMemo(
    () =>
      businesses.filter(
        (b) =>
          Number.isFinite(b.lat) &&
          Number.isFinite(b.lng) &&
          (
            b.name.toLowerCase().includes(search.toLowerCase()) ||
            b.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
            b.address.toLowerCase().includes(search.toLowerCase())
          )
      ),
    [businesses, search]
  );

  const recommended = useMemo(() => {
    if (filtered.length === 0) return [];

    const withDistance = filtered.map((b) => {
      const hasCoordinates = Number.isFinite(b.lat) && Number.isFinite(b.lng);
      const distanceKm = userLocation && hasCoordinates
        ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
        : null;
      return { ...b, distanceKm, travelMinutes: estimateTravelMinutes(distanceKm), hasCoordinates };
    });

    const maxReviews = Math.max(...withDistance.map((b) => b.reviewCount), 1);
    const maxServices = Math.max(...withDistance.map((b) => b.serviceCount), 1);
    const maxDistance = Math.max(
      ...withDistance.map((b) => (b.distanceKm == null ? 0 : b.distanceKm)),
      1
    );

    const scored = withDistance.map((b) => {
      const ratingScore = (b.rating || 0) / 5;
      const reviewScore = b.reviewCount / maxReviews;
      const serviceScore = b.serviceCount / maxServices;
      const distanceScore =
        b.distanceKm == null ? 0 : Math.max(0, 1 - b.distanceKm / maxDistance);

      const openScore = b.is_open ? 0.05 : 0;
      const recommendationScore =
        ratingScore * 0.35 + reviewScore * 0.22 + serviceScore * 0.18 + distanceScore * 0.2 + openScore;

      return {
        ...b,
        recommendationScore,
      };
    });

    return scored.sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) return b.recommendationScore - a.recommendationScore;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, userLocation]);

  const displayedBusinesses = useMemo(() => {
    const list = [...recommended];

    if (sortMode === "nearest") {
      return list.sort((a, b) => {
        const da = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
        const db = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
    }

    if (sortMode === "most_reviews") {
      return list.sort((a, b) => {
        if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [recommended, sortMode]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return recommended.slice(0, 7);
  }, [recommended, search]);

  const nearestBusiness = useMemo(() => {
    const distanceReady = recommended.filter((b) => b.distanceKm != null);
    if (distanceReady.length === 0) return null;
    return [...distanceReady].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }, [recommended]);
  const nearestBusinessId = nearestBusiness?.id || null;

  return (
    <main className="browse-page flex min-h-[calc(100vh-88px)] flex-col overflow-visible bg-[#D9D9D2] font-sans">
      {/* Search row */}
      <section className="relative z-20 shrink-0 overflow-visible bg-[#1A1A1A] px-4 py-5 text-white sm:px-8 sm:py-6 lg:py-7">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="absolute -right-12 -top-28 h-64 w-64 rounded-full border border-white/10" />

        <div className="relative mx-auto w-full max-w-5xl text-center">
          <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
            Find print <span className="text-[#00FFFF]">shops.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-white/65 sm:text-sm">
            Search by shop name, service, or area. Select a result to focus its pin on the map.
          </p>

          <div className="relative mx-auto mt-4 max-w-3xl text-left">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" size={20} />
              <input
                type="text"
                value={search}
                onFocus={() => setShowSuggestions(Boolean(search.trim()))}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setShowSuggestions(Boolean(event.target.value.trim()));
                }}
                className="browse-search h-14 w-full rounded-full border border-white/25 bg-white/10 pl-12 pr-12 text-sm font-semibold text-white placeholder:text-white/45 focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/20 sm:text-base"
                placeholder="Search shop, service, or area..."
                aria-label="Search print shops"
                role="combobox"
                aria-expanded={showSuggestions && Boolean(search.trim())}
                aria-controls="shop-suggestions"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedId(null);
                    setShowSuggestions(false);
                  }}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Clear shop search"
                >
                  <X size={17} />
                </button>
              )}

              {showSuggestions && search.trim() && (
                <div id="shop-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(390px,55vh)] overflow-y-auto rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] p-2 text-[#1A1A1A] shadow-2xl">
                  {loading ? (
                    <div className="flex items-center gap-3 px-4 py-5 text-xs font-bold text-slate-500">
                      <Loader2 size={17} className="animate-spin text-[#EC008C]" /> Searching print shops...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm font-black">No matching shops</p>
                      <p className="mt-1 text-xs text-slate-500">Try another name, service, or area.</p>
                    </div>
                  ) : (
                    suggestions.map((shop) => (
                      <button
                        key={shop.id}
                        type="button"
                        role="option"
                        aria-selected={selectedId === shop.id}
                        onClick={() => {
                          setSearch(shop.name);
                          setSelectedId(shop.id);
                          setShowSuggestions(false);
                          requestAnimationFrame(() => {
                            mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                          });
                        }}
                        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A] text-[#00FFFF]">
                          <MapPin size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black group-hover:text-[#EC008C]">{shop.name}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${shop.is_open ? "bg-emerald-100 text-emerald-700" : "bg-[#ECECE8] text-slate-500"}`}>
                              {shop.is_open ? "Open" : "Closed"}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{shop.address}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-xs font-black text-[#1A1A1A]">
                          <Star size={13} className="fill-[#FFF200] text-[#D6C900]" /> {ratingLabel(shop.rating)}
                          <ChevronRight size={15} className="text-[#EC008C] transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <span className="flex items-center gap-2 font-bold text-white/70">
              <span className="h-2 w-2 rounded-full bg-[#EC008C]" />
              {userLocation
                ? `${displayedBusinesses.length} ${displayedBusinesses.length === 1 ? "nearby shop" : "nearby shops"} around you`
                : `${displayedBusinesses.length} ${displayedBusinesses.length === 1 ? "shop" : "shops"} on the map`}
            </span>
            <label className="flex items-center gap-2 font-semibold text-white/55">
              <SlidersHorizontal size={12} />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                className="browse-sort rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white focus:border-[#00FFFF] focus:ring-0"
                aria-label="Sort print shops"
              >
                <option value="recommended" className="text-[#1A1A1A]">Recommended</option>
                <option value="nearest" className="text-[#1A1A1A]">Nearest first</option>
                <option value="most_reviews" className="text-[#1A1A1A]">Most reviewed</option>
              </select>
            </label>
            <button
              type="button"
              onClick={requestLocation}
              disabled={locationLoading}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/75 transition-colors hover:border-[#00FFFF]/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              <LocateFixed size={13} className="text-[#FFF200]" />
              {locationLoading ? "Finding your exact location..." : userLocation ? "Showing nearby shops" : "Use my location"}
            </button>
            {nearestBusiness && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFF200]/45 bg-[#FFF200]/10 px-3 py-1.5 text-[11px] font-bold text-[#FFF200]">
                Nearest: {nearestBusiness.name} · {nearestBusiness.distanceKm.toFixed(1)} km · ~{nearestBusiness.travelMinutes} min estimated travel
              </span>
            )}
          </div>
        </div>

        <div className="relative mx-auto mt-3 flex max-w-5xl items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
          <MapIcon size={13} className="text-[#FFF200]" /> The map below shows verified shop pins
        </div>
      </section>

      {/* Map row */}
      <section ref={mapSectionRef} className="relative h-[520px] flex-none shrink-0 overflow-hidden bg-[#D9D9D2] sm:h-[600px]">
        {loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#D9D9D2]/90 p-6 text-center">
            <div className="max-w-sm rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
              <p className="text-sm font-black text-slate-900">Print shops are temporarily unavailable</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{loadError}</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-[#EC008C]">Refresh</button>
            </div>
          </div>
        )}
        <MapComponent
          businesses={displayedBusinesses}
          selectedBusinessId={selectedId}
          userLocation={userLocation}
          nearestBusinessId={nearestBusinessId}
        />
      </section>
    </main>
  );
}
