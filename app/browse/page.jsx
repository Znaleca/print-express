"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, Printer, Store } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A] text-[#00FFFF] font-mono animate-pulse">
      <Loader2 className="animate-spin mb-4" size={40} />
      <p className="uppercase tracking-[0.3em] text-xs font-black">Initialising_CMYK_Map_Engine...</p>
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
        // Location is optional. Recommendations will still work with other metrics.
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

  useEffect(() => {
    async function loadBusinesses() {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          id, name, address, lat, lng, logo_url,
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
          lat: parseFloat(b.lat),
          lng: parseFloat(b.lng),
          logo_url: b.logo_url,
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
      const distanceKm = userLocation
        ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
        : null;
      return { ...b, distanceKm };
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

      const recommendationScore =
        ratingScore * 0.4 + reviewScore * 0.25 + serviceScore * 0.2 + distanceScore * 0.15;

      return {
        ...b,
        recommendationScore,
      };
    });

    return scored.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }, [filtered, userLocation]);

  const displayedBusinesses = useMemo(() => {
    const list = [...recommended];

    if (sortMode === "nearest") {
      return list.sort((a, b) => {
        const da = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
        const db = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
        return da - db;
      });
    }

    if (sortMode === "most_reviews") {
      return list.sort((a, b) => b.reviewCount - a.reviewCount);
    }

    return list;
  }, [recommended, sortMode]);

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-[#FDFDFD] font-sans">
      {/* ── Sidebar: Dark Industrial ── */}
      <aside className="w-[450px] shrink-0 flex flex-col bg-[#1A1A1A] text-white z-10 relative border-r-8 border-[#1A1A1A]">

        {/* Header - CMYK Accented */}
        <div className="p-8 border-b-4 border-white/10 bg-[#1A1A1A] relative">
          <div className="absolute top-0 left-0 w-full h-2 flex">
            <div className="flex-1 bg-[#00FFFF]" />
            <div className="flex-1 bg-[#EC008C]" />
            <div className="flex-1 bg-[#FFF200]" />
          </div>

          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Printer size={24} className="text-[#EC008C]" />
              <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none">Find_Shops</h1>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-[#00FFFF] opacity-20 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative flex items-center bg-[#2A2A2A] border-2 border-white/20">
              <Search className="ml-4 text-[#00FFFF]" size={20} />
              <input
                type="text"
                className="w-full bg-transparent px-4 py-4 text-white placeholder:text-white/20 focus:outline-none font-mono text-xs font-black uppercase tracking-widest"
                placeholder="SEARCH_BY_SHOP_OR_SERVICE..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/50 font-black">Sort_By</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="bg-[#2A2A2A] border-2 border-white/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-black text-white focus:outline-none focus:border-[#00FFFF]"
            >
              <option value="recommended">Recommended</option>
              <option value="nearest">Nearest</option>
              <option value="most_reviews">Most Reviewed</option>
            </select>
          </div>
        </div>

        {/* Shop List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#1A1A1A] scrollbar-thin scrollbar-thumb-white/20">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 font-mono uppercase text-[10px] tracking-[0.3em] text-[#00FFFF]">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p>Syncing_Shop_Data...</p>
            </div>
          ) : displayedBusinesses.length === 0 ? (
            <div className="p-10 border-4 border-dashed border-white/10 text-center font-mono text-xs uppercase opacity-40">
              No active shops detected in sector.
            </div>
          ) : (
            displayedBusinesses.map((b, index) => {
              const isSelected = selectedId === b.id;
              return (
                <div key={b.id} className="w-full">
                  <div
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-6 border-4 transition-all relative group cursor-pointer ${isSelected
                        ? "bg-white text-[#1A1A1A] border-[#00FFFF] shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] -translate-x-1 -translate-y-1"
                        : "bg-[#222222] border-white/10 hover:border-white/30"
                      }`}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Logo & Identity */}
                      <div className="flex items-center gap-5">
                        {b.logo_url ? (
                          <div className="relative shrink-0">
                            {isSelected && <div className="absolute -inset-1 bg-[#FFF200] -z-10 translate-x-1 translate-y-1" />}
                            <img
                              src={b.logo_url}
                              alt={b.name}
                              className={`w-16 h-16 object-cover border-4 transition-colors ${isSelected ? "border-[#1A1A1A]" : "border-white/20"}`}
                            />
                          </div>
                        ) : (
                          <div className={`w-16 h-16 flex items-center justify-center border-4 ${isSelected ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white/5 border-white/10 text-white/20"} shrink-0`}>
                            <Store size={24} />
                          </div>
                        )}

                        <div className="flex flex-col">
                          <span className={`font-mono text-[9px] uppercase font-black ${isSelected ? "text-[#EC008C]" : "text-white/40"}`}>
                            ID_{b.id.split('-')[0]}
                          </span>
                          <h2 className="text-3xl font-black uppercase italic leading-none tracking-tighter">
                            {b.name}
                          </h2>
                        </div>
                      </div>

                      <div className={`font-mono text-[10px] uppercase tracking-tighter border-l-4 pl-3 py-1 ${isSelected ? "border-[#1A1A1A]/10 text-gray-500" : "border-white/10 text-white/40"}`}>
                        {b.address}
                      </div>

                      <div className={`flex items-center justify-between border-t-2 pt-4 ${isSelected ? "border-[#1A1A1A]/10" : "border-white/5"}`}>
                        <span className="flex items-center gap-1 font-black text-sm italic">
                          <Star size={16} fill={isSelected ? "#1A1A1A" : "#FFF200"} className={isSelected ? "text-[#1A1A1A]" : "text-[#FFF200]"} />
                          {b.rating.toFixed(1)}
                        </span>

                        <div className="flex gap-1 flex-wrap justify-end">
                          {b.services.map((s, idx) => (
                            <span key={idx} className={`font-mono text-[9px] px-2 py-0.5 border-2 uppercase font-black tracking-tighter ${isSelected ? "bg-[#FFF200] border-[#1A1A1A]" : "bg-white/5 border-white/10"
                              }`}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className={`mt-2 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase ${isSelected ? "text-[#1A1A1A]/70" : "text-white/50"}`}>
                        <span>Reviews: {b.reviewCount}</span>
                        <span>Services: {b.serviceCount}</span>
                        <span>
                          Distance: {b.distanceKm == null ? "--" : `${b.distanceKm.toFixed(1)} km`}
                        </span>
                        <span>{sortMode === "recommended" ? "Rec" : sortMode === "nearest" ? "Near" : "Rev"} Rank: #{index + 1}</span>
                      </div>

                      {isSelected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/business/${b.id}`);
                          }}
                          className="mt-4 w-full py-4 bg-[#1A1A1A] text-white font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#EC008C] transition-all flex items-center justify-center gap-3"
                        >
                          Visit_Shop <ChevronRight size={16} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-6 border-t-4 border-white/10 bg-black flex justify-between items-center">
          <div className="flex gap-2">
            <div className="w-8 h-2 bg-[#00FFFF]" />
            <div className="w-8 h-2 bg-[#EC008C]" />
            <div className="w-8 h-2 bg-[#FFF200]" />
          </div>
          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF]">
            {displayedBusinesses.length}_Shops_Online
          </span>
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="flex-1 relative border-l-8 border-[#1A1A1A] z-0 bg-[#E5E5E5]">
        <MapComponent businesses={displayedBusinesses} selectedBusinessId={selectedId} />

        {/* Floating Sector Label */}
        <div className="absolute top-8 right-8 z-10 bg-[#1A1A1A] text-white px-6 py-4 font-black italic uppercase tracking-widest text-sm flex items-center gap-4 border-4 border-[#00FFFF] shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
          <MapIcon size={20} className="text-[#00FFFF]" />
          Sector_Grid_01
        </div>
      </div>
    </div>
  );
}