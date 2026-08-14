"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, Printer, Store, MapPin, SlidersHorizontal, Navigation } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, []);

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

  const estimateTravelMinutes = (distanceKm) => {
    if (distanceKm == null) return null;
    return Math.max(1, Math.round(distanceKm * 2.5));
  };

  const buildRouteUrl = (shop) => {
    if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) return null;
    const origin = userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : "";
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${shop.lat},${shop.lng}`;
  };

  useEffect(() => {
    async function loadBusinesses() {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          id, name, address, lat, lng, logo_url, is_open,
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
          lat: b.lat == null ? null : parseFloat(b.lat),
          lng: b.lng == null ? null : parseFloat(b.lng),
          logo_url: b.logo_url,
          is_open: b.is_open ?? true,
          rating: parseFloat(avgRating),
          reviewCount: reviews.length,
          serviceCount: availableServices.length,
          services: availableServices.slice(0, 3)
        };
      });

      setBusinesses(formatted);
      setLoading(false);
    }

    loadBusinesses();
  }, []);

  const filtered = useMemo(
    () =>
      businesses.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
          b.address.toLowerCase().includes(search.toLowerCase())
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

  const nearestBusiness = useMemo(() => {
    const distanceReady = recommended.filter((b) => b.distanceKm != null);
    if (distanceReady.length === 0) return null;
    return [...distanceReady].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }, [recommended]);
  const nearestBusinessId = nearestBusiness?.id || null;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-88px)] overflow-hidden bg-slate-50 font-sans">
      
      {/* Sidebar View */}
      <aside className="w-full lg:w-[460px] shrink-0 flex flex-col bg-white border-r border-slate-200 z-10 relative shadow-md">

        {/* Top Filter Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-white relative">
          <div className="cmyk-bar absolute top-0 left-0 right-0" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <Printer size={18} className="text-[#00FFFF]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">Find Print Shops</h1>
                <p className="text-[11px] text-slate-500 mt-0.5">{displayedBusinesses.length} registered verified shops available</p>
              </div>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EC008C] focus:border-transparent transition-all"
              placeholder="Search by shop name, service, or area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <SlidersHorizontal size={12} /> Sort by:
            </span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00FFFF]"
            >
              <option value="recommended">Recommended</option>
              <option value="nearest">Nearest to Me</option>
              <option value="most_reviews">Most Reviewed</option>
            </select>
          </div>
          {nearestBusiness && (
            <div className="mt-3 rounded-xl border border-[#FFF200] bg-[#FFF200]/20 px-3 py-2 text-xs text-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold truncate">Nearest: {nearestBusiness.name}</span>
                <span className="font-semibold shrink-0">{nearestBusiness.distanceKm.toFixed(1)} km | ~{nearestBusiness.travelMinutes} min</span>
              </div>
            </div>
          )}
        </div>

        {/* Shop List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-xs font-semibold text-slate-500">
              <Loader2 className="animate-spin mb-3 text-[#EC008C]" size={32} />
              <p>Loading print shops...</p>
            </div>
          ) : displayedBusinesses.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 bg-white text-center text-xs font-medium text-slate-500">
              No print shops match your search criteria.
            </div>
          ) : (
            displayedBusinesses.map((b) => {
              const isSelected = selectedId === b.id;
              return (
                <div key={b.id} className="w-full">
                  <div
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                      isSelected
                        ? "bg-white border-[#EC008C] shadow-md ring-2 ring-[#EC008C]/20"
                        : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                    } ${!b.is_open ? "opacity-75" : ""}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Logo */}
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

                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin size={12} className="shrink-0 text-slate-400" />
                          <span>{b.address}</span>
                        </p>

                        <div className="flex items-center justify-between gap-3 mt-2 text-xs">
                          <div className="flex items-center gap-1 font-bold text-slate-900">
                            <Star size={14} className="fill-amber-400 text-amber-400" />
                            <span>{b.rating.toFixed(1)}</span>
                            <span className="text-slate-400 font-normal">({b.reviewCount})</span>
                          </div>

                          {b.distanceKm != null ? (
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                              <span>{b.distanceKm.toFixed(1)} km away</span>
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                                ~{b.travelMinutes} min drive
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400">
                              No pinned map location
                            </span>
                          )}
                        </div>

                        {/* Nearest Shop Badge & Open Route Action */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100">
                          {b.id === nearestBusinessId ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#00FFFF]/20 text-slate-900 text-[10px] font-extrabold uppercase tracking-wider">
                              Nearest Shop
                            </span>
                          ) : <span />}

                          {buildRouteUrl(b) ? (
                            <a
                              href={buildRouteUrl(b)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 hover:text-[#EC008C] transition-colors"
                            >
                              <Navigation size={12} className="text-[#EC008C]" />
                              Show Route
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">Route unavailable</span>
                          )}
                        </div>

                        {/* Service tags */}
                        <div className="flex gap-1.5 flex-wrap mt-2.5">
                          {b.services.map((s, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium">
                              {s}
                            </span>
                          ))}
                        </div>

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/business/${b.id}`);
                            }}
                            className="mt-3.5 w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            View Shop Details <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Map View */}
      <div className="flex-1 relative z-0 bg-slate-200">
        <MapComponent
          businesses={displayedBusinesses}
          selectedBusinessId={selectedId}
          userLocation={userLocation}
          nearestBusinessId={nearestBusinessId}
        />

        {/* Floating Header */}
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-md text-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 shadow-lg text-xs font-semibold flex items-center gap-2">
          <MapIcon size={16} className="text-[#00E5FF]" />
          <span>Interactive Map | nearest route highlighted</span>
        </div>
      </div>

    </div>
  );
}
