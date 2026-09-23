"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { Star, ChevronRight, MapPin, UserRound } from "lucide-react";
import { ratingLabel } from "@/lib/rating";
import { DEFAULT_MAP_CENTER, normalizeCoordinates } from "@/lib/coordinates";
import RoadRoute from "@/components/RoadRoute";
import "leaflet/dist/leaflet.css";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const createShopPinIcon = (color = "#00FFFF", isClosed = false, isSelected = false) => {
  const displayColor = isSelected ? "#EC008C" : isClosed ? "#94A3B8" : color;
  const size = isSelected ? 40 : 36;
  const borderWidth = isSelected ? 4 : 3;
  return new L.DivIcon({
    className: "shop-pin-marker-container",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${displayColor};
        border: ${borderWidth}px solid #1A1A1A;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex; 
        align-items: center; 
        justify-content: center;
        box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
        ${isClosed ? "opacity: 0.65;" : ""}
      ">
        <div style="
          width: 11px;
          height: 11px;
          border: 2px solid #1A1A1A;
          border-radius: 50%;
          background: #FFFFFF;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 3)],
  });
};

const createUserLocationIcon = () => new L.DivIcon({
  className: "user-location-marker-container",
  html: `
    <div style="
      width: 42px;
      height: 42px;
      background: #FFF200;
      border: 3px solid #1A1A1A;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgb(26 26 26 / 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    " role="img" aria-label="Your location" title="Your location">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="7.5" r="3.5" fill="#1A1A1A" />
        <path d="M4 20a8 8 0 0 1 16 0H4Z" fill="#1A1A1A" />
      </svg>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -24],
});

function MapController({ center, selectedBusinessId, markerRefs, routePoints, shopPoints, hasUserLocation }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !center) return;

    const isMapReady = () => {
      try {
        const container = map.getContainer?.();
        map.getCenter?.();
        return Boolean(container?.isConnected);
      } catch {
        return false;
      }
    };

    if (!isMapReady()) return;

    try {
      map.invalidateSize({ pan: false });
    } catch {
      return undefined;
    }
    let moveTimer;
    if (selectedBusinessId) {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.flyTo(center, 16, { duration: 1.2, easeLinearity: 0.25 });
        } catch { /* map was disposed during a route change */ }
      }, 50);
    } else if (hasUserLocation) {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.flyTo(center, 13, { duration: 1.2, easeLinearity: 0.25 });
        } catch { /* map was disposed during a route change */ }
      }, 50);
    } else if (routePoints?.length === 2) {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.fitBounds(routePoints, { padding: [48, 48], maxZoom: 15 });
        } catch { /* map was disposed during a route change */ }
      }, 80);
    } else if (shopPoints?.length > 1) {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.fitBounds(shopPoints, { padding: [48, 48], maxZoom: 13 });
        } catch { /* map was disposed during a route change */ }
      }, 80);
    } else if (shopPoints?.length === 1) {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.flyTo(shopPoints[0], 13, { duration: 1.2, easeLinearity: 0.25 });
        } catch { /* map was disposed during a route change */ }
      }, 50);
    } else {
      moveTimer = setTimeout(() => {
        if (!isMapReady()) return;
        try {
          map.flyTo(center, 13, { duration: 1.2, easeLinearity: 0.25 });
        } catch { /* map was disposed during a route change */ }
      }, 50);
    }

    let popupTimer;
    if (selectedBusinessId && markerRefs.current[selectedBusinessId]) {
      popupTimer = setTimeout(() => {
        if (!isMapReady()) return;
        const marker = markerRefs.current[selectedBusinessId];
        try {
          marker.openPopup();
        } catch { /* marker was disposed during a route change */ }
      }, 600);
    }

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(popupTimer);
    };
  }, [selectedBusinessId, center, map, markerRefs, routePoints, shopPoints, hasUserLocation]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map?.getContainer?.();
    if (!container) return undefined;

    const invalidate = () => {
      try {
        if (container.isConnected) map.invalidateSize({ pan: false, animate: false });
      } catch {
        // Leaflet may already be disposed during a route transition.
      }
    };

    invalidate();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(invalidate) : null;
    observer?.observe(container);
    window.addEventListener("orientationchange", invalidate);

    return () => {
      observer?.disconnect();
      window.removeEventListener("orientationchange", invalidate);
    };
  }, [map]);

  return null;
}

export default function MapComponent({ businesses, selectedBusinessId, userLocation, nearestBusinessId, emptyMessage }) {
  const router = useRouter();
  const markerRefs = useRef({});
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const mapBusinesses = useMemo(
    () => (Array.isArray(businesses) ? businesses : [])
      .map((business) => {
        const coordinates = normalizeCoordinates(business?.lat, business?.lng);
        return coordinates ? { ...business, ...coordinates } : null;
      })
      .filter(Boolean),
    [businesses]
  );
  const safeUserLocation = useMemo(
    () => normalizeCoordinates(userLocation?.lat, userLocation?.lng),
    [userLocation]
  );
  const userLocationIcon = useMemo(() => createUserLocationIcon(), []);
  const markerIcons = useMemo(() => Object.fromEntries(
    mapBusinesses.map((business) => {
      const isSelected = selectedBusinessId === business.id;
      const isNearest = nearestBusinessId === business.id;
      const color = isSelected ? "#EC008C" : isNearest ? "#FFF200" : "#00FFFF";
      return [business.id, createShopPinIcon(color, !business.is_open, isSelected)];
    })
  ), [mapBusinesses, nearestBusinessId, selectedBusinessId]);
  const selected = mapBusinesses.find((b) => b.id === selectedBusinessId);
  // With a real user location, always show a road route to the nearest mapped
  // shop. A manually selected shop still takes priority for its own route.
  const nearest = mapBusinesses.find((business) => business.id === nearestBusinessId);
  const routeTarget = selected || (safeUserLocation ? nearest : null);
  const routePoints = useMemo(
    () => (safeUserLocation && routeTarget
      ? [[safeUserLocation.lat, safeUserLocation.lng], [routeTarget.lat, routeTarget.lng]]
      : null),
    [routeTarget, safeUserLocation]
  );
  const shopPoints = useMemo(
    () => mapBusinesses.map((business) => [business.lat, business.lng]),
    [mapBusinesses]
  );
  const center = selected
    ? [selected.lat, selected.lng]
    : safeUserLocation
      ? [safeUserLocation.lat, safeUserLocation.lng]
      : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

  if (!isMounted) return <div className="w-full h-full bg-slate-100 animate-pulse" />;

  return (
    <div className="w-full h-full relative bg-slate-200" role="region" aria-label="Printing shops map">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className="z-0 w-full h-full"
        zoomControl={false}
      >
        <MapResizeHandler />
        <MapController
          center={center}
          selectedBusinessId={selectedBusinessId}
          markerRefs={markerRefs}
          routePoints={routePoints}
          shopPoints={shopPoints}
          hasUserLocation={Boolean(safeUserLocation)}
        />

        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
        />

        {safeUserLocation && (
          <Marker
            position={[safeUserLocation.lat, safeUserLocation.lng]}
            icon={userLocationIcon}
            zIndexOffset={1000}
            title="Your location"
            alt="Your location"
          >
            <Popup closeButton={false}>You are here</Popup>
          </Marker>
        )}

        {routePoints && <RoadRoute points={routePoints} />}

        {mapBusinesses.map((b) => {
          const isSelected = selectedBusinessId === b.id;
          const isNearest = nearestBusinessId === b.id;
          const isClosed = !b.is_open;
          return (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              icon={markerIcons[b.id]}
              title={`Printing shop: ${b.name}`}
              alt={`Printing shop: ${b.name}`}
              ref={(el) => {
                if (el) {
                  markerRefs.current[b.id] = el;
                } else {
                  delete markerRefs.current[b.id];
                }
              }}
            >
              <Popup closeButton={false} autoPanPaddingTop={96} autoPanPaddingBottom={32} className="clean-map-popup">
                <div className="w-full min-w-0 max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl">
                  <div className="cmyk-bar absolute top-0 left-0 right-0" />
                  
                  <div className="flex items-start justify-between gap-2 mb-1.5 pt-1">
                    <p className="font-bold text-sm text-slate-900 leading-snug">
                      {b.name}
                    </p>
                    {isClosed ? (
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">CLOSED</span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">OPEN</span>
                    )}
                  </div>

                  {isNearest && (
                    <div className="mb-2 inline-flex px-2 py-0.5 rounded-md bg-[#FFF200] text-slate-900 text-[10px] font-extrabold uppercase tracking-wider">
                      Nearest shop
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                    <MapPin size={12} className="shrink-0 text-slate-400" />
                    <span className="truncate">{b.address}</span>
                  </p>

                  {b.matchReason && (
                    <p className="mb-3 rounded-lg bg-[#00FFFF]/10 px-2.5 py-2 text-[10px] font-bold text-[#008F91]">
                      {b.matchReason}
                    </p>
                  )}

                  {safeUserLocation && b.distanceKm != null && (
                    <p className="mb-3 rounded-lg bg-[#FFF200]/20 px-2.5 py-2 text-[10px] font-bold text-slate-700">
                      {b.distanceKm.toFixed(1)} km · ~{b.travelMinutes || Math.max(1, Math.round(b.distanceKm * 2.5))} min estimated travel time
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-1 font-bold text-xs text-slate-900">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      <span>{ratingLabel(b.rating)}</span>
                    </div>

                    <button
                      onClick={() => router.push(`/business/${b.id}`)}
                      className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#EC008C] transition-all flex items-center gap-1 group shadow-sm"
                    >
                      View Shop <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[500] max-w-[calc(100%-2rem)]" role="group" aria-label="Map legend">
        <div className="rounded-2xl border border-[#D8D6CE] bg-white/95 px-3 py-2.5 text-[11px] font-bold text-slate-700 shadow-md">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Map key</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5"><UserRound size={17} strokeWidth={2.5} className="rounded-full bg-[#FFF200] p-0.5 text-[#1A1A1A]" aria-hidden="true" /> Your location</span>
            <span className="inline-flex items-center gap-1.5"><MapPin size={17} strokeWidth={2.5} className="text-[#00AFC0]" aria-hidden="true" /> Printing shop</span>
            {routePoints && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-[#EC008C]" aria-hidden="true" /> Road route</span>}
          </div>
        </div>
      </div>

      {mapBusinesses.length === 0 && !safeUserLocation && (
        <div className="pointer-events-none absolute inset-x-4 top-24 z-10 flex justify-center sm:top-20">
          <div className="rounded-xl border border-[#D8D6CE] bg-white/95 px-4 py-3 text-center text-xs font-bold text-slate-700 shadow-md">
            {emptyMessage || (businesses.length > 0
              ? "Matching shops do not have mapped locations yet."
              : "No verified shop locations are available yet.")}
          </div>
        </div>
      )}

      <style jsx global>{`
        .clean-map-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .clean-map-popup .leaflet-popup-tip {
          background: #FFFFFF !important;
          border: 1px solid #CBD5E1 !important;
        }
        .clean-map-popup .leaflet-popup-content {
          margin: 0 !important;
          width: min(360px, calc(100vw - 48px)) !important;
          max-width: calc(100vw - 48px) !important;
        }
        .shop-pin-marker-container,
        .user-location-marker-container {
          border: 0 !important;
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}
