"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { Star, ChevronRight, MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";

const createCmykIcon = (color = "#00FFFF", isClosed = false) => {
  const displayColor = isClosed ? "#94A3B8" : color;
  return new L.DivIcon({
    className: "custom-marker-container",
    html: `
      <div style="
        width: 32px; 
        height: 32px; 
        background: #0F172A; 
        border: 3px solid ${displayColor}; 
        border-radius: 50%;
        display: flex; 
        align-items: center; 
        justify-content: center;
        box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
        ${isClosed ? 'opacity: 0.7;' : ''}
      ">
        <div style="
          width: 10px; 
          height: 10px; 
          border-radius: 50%;
          background: ${displayColor}; 
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -35],
  });
};

function MapController({ center, selectedBusinessId, markerRefs, routePoints }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !center) return;

    map.invalidateSize();
    let moveTimer;
    if (routePoints?.length === 2) {
      moveTimer = setTimeout(() => {
        map.fitBounds(routePoints, { padding: [48, 48], maxZoom: 15 });
      }, 80);
    } else {
      const zoomLevel = selectedBusinessId ? 16 : 13;
      moveTimer = setTimeout(() => {
        map.flyTo(center, zoomLevel, {
          duration: 1.2,
          easeLinearity: 0.25,
        });
      }, 50);
    }

    let popupTimer;
    if (selectedBusinessId && markerRefs.current[selectedBusinessId]) {
      popupTimer = setTimeout(() => {
        markerRefs.current[selectedBusinessId].openPopup();
      }, routePoints?.length === 2 ? 350 : 600);
    }

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(popupTimer);
    };
  }, [selectedBusinessId, center, map, markerRefs, routePoints]);

  return null;
}

export default function MapComponent({ businesses, selectedBusinessId, userLocation, nearestBusinessId }) {
  const router = useRouter();
  const markerRefs = useRef({});
  const mapRef = useRef(null);
  const [mapKey] = useState(() => new Date().getTime());
  const [isMounted, setIsMounted] = useState(false);
  const defaultCenter = [14.6806, 120.5375];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const mapBusinesses = businesses.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng));
  const selected = mapBusinesses.find((b) => b.id === selectedBusinessId);
  const nearest = mapBusinesses.find((b) => b.id === nearestBusinessId);
  const routeTarget = selected || nearest;
  const routePoints = userLocation && routeTarget
    ? [[userLocation.lat, userLocation.lng], [routeTarget.lat, routeTarget.lng]]
    : null;
  const center = selected ? [selected.lat, selected.lng] : userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter;

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!isMounted) return <div className="w-full h-full bg-slate-100 animate-pulse" />;

  return (
    <div className="w-full h-full relative bg-slate-200">
      <MapContainer
        key={mapKey}
        ref={mapRef}
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="z-0 w-full h-full"
        zoomControl={false}
      >
        <MapController
          center={center}
          selectedBusinessId={selectedBusinessId}
          markerRefs={markerRefs}
          routePoints={routePoints}
        />

        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{ color: "#1A1A1A", fillColor: "#FFF200", fillOpacity: 1, weight: 3 }}
          >
            <Popup closeButton={false}>Your location</Popup>
          </CircleMarker>
        )}

        {routePoints && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: "#EC008C", weight: 4, dashArray: "10 8", opacity: 0.9 }}
          />
        )}

        {mapBusinesses.map((b) => {
          const isSelected = selectedBusinessId === b.id;
          const isNearest = nearestBusinessId === b.id;
          const isClosed = !b.is_open;
          return (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              icon={createCmykIcon(isSelected ? "#EC008C" : isNearest ? "#FFF200" : "#00FFFF", isClosed)}
              ref={(el) => {
                if (el) markerRefs.current[b.id] = el;
              }}
            >
              <Popup closeButton={false} className="clean-map-popup">
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xl min-w-[240px] text-slate-900 overflow-hidden relative">
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

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-1 font-bold text-xs text-slate-900">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      <span>{b.rating.toFixed(1)}</span>
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
          width: auto !important;
        }
      `}</style>
    </div>
  );
}
