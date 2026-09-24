"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, MapPin, SlidersHorizontal, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getRatingStats, ratingLabel } from "@/lib/rating";
import { withTimeout } from "@/lib/withTimeout";
import { normalizeCoordinates } from "@/lib/coordinates";
import { getShopSearchResult } from "@/lib/shopSearch";
import { normalizeServiceCategory } from "@/lib/serviceCategories";
import { startMinuteAlignedRefresh } from "@/lib/openStateRefresh";

const estimateTravelMinutes = (distanceKm) => (
  distanceKm == null ? null : Math.max(1, Math.round(Number(distanceKm) * 2.5))
);

const LOCATION_STATUS_MESSAGES = Object.freeze({
  denied: "Location access was denied. Allow location access in your browser settings to sort shops by distance.",
  unavailable: "Your location is unavailable right now. Check your device location services and try again.",
  timeout: "Finding your location took too long. Check your connection and try again.",
  invalid: "We could not use the location returned by your device. Please try again.",
});

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-[#00FFFF] font-sans animate-pulse">
      <Loader2 className="animate-spin mb-4" size={36} />
      <p className="tracking-wider text-xs font-semibold uppercase">Loading Map View...</p>
    </div>
  ),
});

function BrowsePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category") || "";
  const categoryFilter = categoryParam ? normalizeServiceCategory(categoryParam, categoryParam) : "";
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("recommended");
  const [selectedId, setSelectedId] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationSource, setLocationSource] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const mapSectionRef = useRef(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationLoading(true);
    setLocationStatus("loading");
    setIsSelectingLocation(false);
    setSelectedId(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coordinates = normalizeCoordinates(pos.coords.latitude, pos.coords.longitude);
        if (!coordinates) {
          setLocationLoading(false);
          setLocationStatus("invalid");
          return;
        }
        setUserLocation(coordinates);
        setLocationSource("current");
        setSortMode("nearest");
        setLocationLoading(false);
        setLocationStatus("granted");
      },
      (error) => {
        setLocationLoading(false);
        setLocationStatus(error?.code === 1 ? "denied" : error?.code === 3 ? "timeout" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const startPinningLocation = () => {
    const nextSelectingState = !isSelectingLocation;
    setIsSelectingLocation(nextSelectingState);
    setLocationLoading(false);
    setSelectedId(null);
    setLocationStatus(nextSelectingState ? "pinning" : locationSource ? locationSource === "pinned" ? "pinned" : "granted" : "idle");
    if (nextSelectingState) {
      requestAnimationFrame(() => {
        mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  const handleMapLocationSelect = useCallback((coordinates) => {
    setUserLocation(coordinates);
    setLocationSource("pinned");
    setLocationStatus("pinned");
    setIsSelectingLocation(false);
    setLocationLoading(false);
    setSelectedId(null);
    setSortMode("nearest");
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
    let active = true;
    let refreshTimer;
    let subscription;

    async function loadBusinesses() {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: bizData, error: bizError } = await withTimeout(
          (signal) => supabase
            .from("businesses")
            .select(`
              id, name, address, description, products_summary, lat, lng, logo_url, is_open,
              services ( name, category, description, item_type, available )
            `)
            .eq("status", "APPROVED")
            .eq("lifecycle_state", "ACTIVE")
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

        const businessIds = (bizData || []).map((business) => business.id);
        const { data: openStateRows } = businessIds.length > 0
          ? await supabase.rpc("get_business_open_states", { p_business_ids: businessIds })
          : { data: [] };
        const openStateByBusiness = Object.fromEntries((openStateRows || []).map((row) => [row.business_id, row.is_open]));

        // Keep ratings optional. The public view contains only visible reviews and
        // can be absent until the review consistency migration is applied.
        // Embedding the review view can fail when
        // PostgREST has not inferred a relationship for the view yet.
        const { data: reviewData, error: reviewError } = await withTimeout(
          (signal) => supabase
            .from("visible_business_reviews")
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
        const { data: itemReviewData } = await withTimeout(
          (signal) => supabase.from("visible_order_item_reviews").select("business_id, rating").range(0, 999).abortSignal(signal),
          8000,
          "Loading item ratings timed out."
        );
        const reviewsByBusiness = [...(reviewData || []), ...(itemReviewData || [])].reduce((map, review) => {
          map[review.business_id] = [...(map[review.business_id] || []), review];
          return map;
        }, {});

        const formatted = (bizData || []).map((b) => {
          const catalog = (b.services || [])
            .filter((service) => service?.available !== false)
            .map((service) => ({
              ...service,
              category: normalizeServiceCategory(service.category, `${service.name || ""} ${service.description || ""}`),
            }));
          const availableServices = catalog.map((service) => service.name).filter(Boolean);

          const reviews = reviewsByBusiness[b.id] || [];
          const ratingStats = getRatingStats(reviews);
          const coordinates = normalizeCoordinates(b.lat, b.lng);

          return {
            id: b.id,
            name: b.name || "Print Shop",
            address: b.address || "Location unavailable",
            lat: coordinates?.lat ?? null,
            lng: coordinates?.lng ?? null,
            logo_url: b.logo_url,
            is_open: openStateByBusiness[b.id] ?? b.is_open ?? true,
            rating: ratingStats.average,
            reviewCount: ratingStats.count,
            serviceCount: availableServices.length,
            services: availableServices.slice(0, 3),
            catalog,
            description: b.description || "",
            products_summary: b.products_summary || "",
          };
        });

        if (active) setBusinesses(formatted);
      } catch (error) {
        if (active) {
          console.error("Error loading print shops:", error);
          setLoadError(error.message || "We could not load verified print shops right now. Please refresh and try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBusinesses();

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (active) void loadBusinesses();
      }, 300);
    };

    subscription = supabase
      .channel(`public_browse_directory_${Date.now()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "businesses" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefresh)
      .subscribe();

    return () => {
      active = false;
      clearTimeout(refreshTimer);
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const filtered = useMemo(
    () =>
      businesses
        .map((business) => ({
          ...business,
          ...getShopSearchResult(business, search),
        }))
        .filter((business) => business.matched)
        .filter((business) => !categoryFilter || business.catalog.some((service) => service.category === categoryFilter)),
    [businesses, categoryFilter, search]
  );

  const businessIdsKey = useMemo(() => businesses.map((business) => business.id).join(","), [businesses]);

  useEffect(() => {
    const businessIds = businessIdsKey ? businessIdsKey.split(",") : [];
    if (businessIds.length === 0) return undefined;

    return startMinuteAlignedRefresh(async () => {
      const { data: openStateRows, error } = await supabase.rpc("get_business_open_states", { p_business_ids: businessIds });
      if (error || !openStateRows) return;
      const openStateByBusiness = Object.fromEntries(openStateRows.map((row) => [row.business_id, row.is_open]));
      setBusinesses((current) => current.map((business) => ({
        ...business,
        is_open: openStateByBusiness[business.id] ?? business.is_open,
      })));
    });
  }, [businessIdsKey]);

  useEffect(() => {
    if (selectedId && !filtered.some((business) => business.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

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

  const selectSuggestion = (shop) => {
    setSearch(shop.name);
    setSelectedId(shop.id);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

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
            Search printing shops or an area, use your current location, or pin any location on the map.
          </p>
          {categoryFilter && (
            <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-[#00FFFF]/35 bg-[#00FFFF]/10 px-3 py-1.5 text-[11px] font-bold text-[#00FFFF]">
              <span>Showing {categoryFilter}</span>
              <button type="button" onClick={() => router.push("/browse")} className="rounded-full px-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Clear printing category filter"><X size={13} /></button>
            </div>
          )}

          <div className="relative mx-auto mt-4 max-w-3xl text-left">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" size={20} />
              <input
                type="text"
                value={search}
                onFocus={() => setShowSuggestions(Boolean(search.trim()))}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setShowSuggestions(Boolean(event.target.value.trim()));
                  setActiveSuggestionIndex(-1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setShowSuggestions(false);
                    setActiveSuggestionIndex(-1);
                    return;
                  }
                  if (!showSuggestions || suggestions.length === 0) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
                  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
                    event.preventDefault();
                    selectSuggestion(suggestions[activeSuggestionIndex]);
                  }
                }}
                className="browse-search h-14 w-full rounded-full border border-white/25 bg-white/10 pl-12 pr-12 text-sm font-semibold text-white placeholder:text-white/45 focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/20 sm:text-base"
                placeholder="Search printing shops or area..."
                aria-label="Search printing shops or area"
                data-tour="browse-search"
                role="combobox"
                aria-expanded={showSuggestions && Boolean(search.trim())}
                aria-controls="shop-suggestions"
                aria-activedescendant={activeSuggestionIndex >= 0 ? `shop-suggestion-${suggestions[activeSuggestionIndex]?.id}` : undefined}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedId(null);
                    setShowSuggestions(false);
                    setActiveSuggestionIndex(-1);
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
                        id={`shop-suggestion-${shop.id}`}
                        aria-selected={selectedId === shop.id}
                        onClick={() => selectSuggestion(shop)}
                        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white ${activeSuggestionIndex === suggestions.indexOf(shop) ? "bg-white" : ""}`}
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
                          {shop.matchReason && <p className="mt-1 truncate text-[10px] font-semibold text-[#008F91]">{shop.matchReason}</p>}
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
              {locationSource === "pinned"
                ? `${displayedBusinesses.length} ${displayedBusinesses.length === 1 ? "nearby shop" : "nearby shops"} around your pinned location`
                : userLocation
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
              aria-busy={locationLoading}
              title={locationLoading ? "Finding your location" : "Use your current device location to find nearby shops"}
              aria-label={locationLoading ? "Finding your current location" : locationSource === "current" ? "Refresh nearby shops using my current location" : "See nearby shops using my current location"}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/75 transition-colors hover:border-[#00FFFF]/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              <UserRound size={13} className="text-[#FFF200]" aria-hidden="true" />
              {locationLoading ? "Finding your location..." : locationSource === "current" ? "Refresh nearby" : "See nearby shops"}
            </button>
            <button
              type="button"
              onClick={startPinningLocation}
              aria-pressed={isSelectingLocation}
              aria-label={isSelectingLocation ? "Cancel pin location mode" : "Pin a custom location on the map"}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${isSelectingLocation ? "border-[#EC008C] bg-[#EC008C] text-white" : "border-[#EC008C]/45 bg-[#EC008C]/10 text-[#FF8AC7] hover:border-[#EC008C] hover:bg-[#EC008C]/20 hover:text-white"}`}
            >
              {isSelectingLocation ? <X size={13} aria-hidden="true" /> : <MapPin size={13} aria-hidden="true" />}
              {isSelectingLocation ? "Cancel pin" : locationSource === "pinned" ? "Move pinned location" : "Pin a location"}
            </button>
            {nearestBusiness && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFF200]/45 bg-[#FFF200]/10 px-3 py-1.5 text-[11px] font-bold text-[#FFF200]">
                Nearest: {nearestBusiness.name} · {nearestBusiness.distanceKm.toFixed(1)} km · ~{nearestBusiness.travelMinutes} min estimated travel
              </span>
            )}
          </div>
          {locationStatus !== "idle" && locationStatus !== "loading" && locationStatus !== "granted" && LOCATION_STATUS_MESSAGES[locationStatus] && (
            <p role="status" className="mx-auto mt-3 flex max-w-2xl items-start justify-center gap-2 text-[11px] font-semibold leading-relaxed text-[#FFF200]">
              <UserRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{LOCATION_STATUS_MESSAGES[locationStatus]}</span>
            </p>
          )}
        </div>

        <div className="relative mx-auto mt-3 flex max-w-5xl items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
          <MapIcon size={13} className="text-[#FFF200]" /> The map below shows your location and verified shop pins
        </div>
      </section>

      {/* Map row */}
      <section ref={mapSectionRef} data-tour="browse-map" className="relative h-[520px] flex-none shrink-0 overflow-hidden bg-[#D9D9D2] sm:h-[600px]">
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
          userLocationLabel={locationSource === "pinned" ? "Pinned location" : "Your location"}
          nearestBusinessId={nearestBusinessId}
          isSelectingLocation={isSelectingLocation}
          onMapLocationSelect={handleMapLocationSelect}
          emptyMessage={search.trim() && filtered.length === 0 ? "No approved shops match this search." : null}
        />
      </section>
    </main>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<main className="flex min-h-[calc(100vh-88px)] items-center justify-center bg-[#D9D9D2] text-xs font-bold text-slate-500">Loading print shops...</main>}>
      <BrowsePageContent />
    </Suspense>
  );
}
