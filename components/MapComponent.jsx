"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { Star, ChevronRight } from "lucide-react";
import "leaflet/dist/leaflet.css";

const createCmykIcon = (color = "#00FFFF") => {
  return new L.DivIcon({
    className: "custom-marker-container",
    html: `
      <div style="
        width: 32px; 
        height: 32px; 
        background: #1A1A1A; 
        border: 3px solid ${color}; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        transform: rotate(45deg);
        box-shadow: 4px 4px 0px rgba(0,0,0,0.2);
      ">
        <div style="
          width: 8px; 
          height: 8px; 
          background: ${color}; 
          transform: rotate(-45deg);
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -35],
  });
};

function MapController({ center, selectedBusinessId, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !center) return;

    map.invalidateSize();
    const zoomLevel = selectedBusinessId ? 16 : 13;

    const moveTimer = setTimeout(() => {
      map.flyTo(center, zoomLevel, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }, 50);

    let popupTimer;
    if (selectedBusinessId && markerRefs.current[selectedBusinessId]) {
      popupTimer = setTimeout(() => {
        markerRefs.current[selectedBusinessId].openPopup();
      }, 600);
    }

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(popupTimer);
    };
  }, [selectedBusinessId, center, map, markerRefs]);

  return null;
}

export default function MapComponent({ businesses, selectedBusinessId }) {
  const router = useRouter();
  const markerRefs = useRef({});
  const [isMounted, setIsMounted] = useState(false); // Fix for Hydration/DOM issues
  const defaultCenter = [14.6806, 120.5375];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const selected = businesses.find((b) => b.id === selectedBusinessId);
  const center = selected ? [selected.lat, selected.lng] : defaultCenter;

  if (!isMounted) return <div className="w-full h-full bg-[#1A1A1A]" />;

  return (
    <div className="w-full h-full relative bg-[#E5E5E5]">
      <MapContainer
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
        />

        {/* TileLayer inside MapContainer is now safe */}
        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {businesses.map((b) => {
          const isSelected = selectedBusinessId === b.id;
          return (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              icon={createCmykIcon(isSelected ? "#EC008C" : "#00FFFF")}
              ref={(el) => {
                if (el) markerRefs.current[b.id] = el;
              }}
            >
              <Popup closeButton={false} className="industrial-popup">
                <div className="p-4 bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(255,242,0,1)] min-w-[240px]">
                  <div className="flex h-2 mb-3">
                    <div className="flex-1 bg-[#00FFFF]" />
                    <div className="flex-1 bg-[#EC008C]" />
                    <div className="flex-1 bg-[#FFF200]" />
                  </div>

                  <p className="font-black uppercase italic text-xl leading-none mb-1 text-[#1A1A1A] tracking-tighter">
                    {b.name}
                  </p>

                  <p className="font-mono text-[10px] text-gray-500 mb-4 uppercase tracking-tighter font-bold">
                    LOC // {b.address}
                  </p>

                  <div className="flex items-center justify-between border-t-4 border-[#1A1A1A] pt-4">
                    <div className="flex items-center gap-1 bg-[#1A1A1A] text-white px-2 py-1">
                      <Star size={12} fill="#FFF200" className="text-[#FFF200]" />
                      <span className="font-black text-xs">{b.rating.toFixed(1)}</span>
                    </div>

                    <button
                      onClick={() => router.push(`/business/${b.id}`)}
                      className="bg-[#1A1A1A] text-white text-[10px] font-black font-mono uppercase px-3 py-2 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all flex items-center gap-2 group"
                    >
                      VISIT_SHOP <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <style jsx global>{`
        .industrial-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .industrial-popup .leaflet-popup-tip {
          background: #1A1A1A !important;
          border: 2px solid #1A1A1A !important;
          border-radius: 0 !important;
        }
        .industrial-popup .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }
      `}</style>
    </div>
  );
}