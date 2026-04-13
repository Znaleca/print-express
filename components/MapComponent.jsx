"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { Star, ChevronRight } from "lucide-react";

// Custom CMYK Marker Icon - High Contrast Solid Colors
const createCmykIcon = (color = "#00FFFF") => {
  return new L.DivIcon({
    className: "custom-marker",
    html: `
      <div style="
        width: 30px; 
        height: 30px; 
        background: #1A1A1A; 
        border: 3px solid ${color}; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        transform: rotate(45deg);
        box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 8px; 
          height: 8px; 
          background: ${color}; 
          transform: rotate(-45deg);
        "></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -35],
  });
};

function MapController({ center, selectedBusinessId, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15, { animate: true });
    }

    if (selectedBusinessId && markerRefs.current[selectedBusinessId]) {
      markerRefs.current[selectedBusinessId].openPopup();
    }
  }, [center, selectedBusinessId, map, markerRefs]);

  return null;
}

export default function MapComponent({ businesses, selectedBusinessId }) {
  const router = useRouter();
  const markerRefs = useRef({});
  const defaultCenter = [14.6806, 120.5375];

  const selected = businesses.find((b) => b.id === selectedBusinessId);
  const center = selected ? [selected.lat, selected.lng] : defaultCenter;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <MapController
          center={center}
          selectedBusinessId={selectedBusinessId}
          markerRefs={markerRefs}
        />

        {/* Standard Full Color Tiles - Clean Voyager Style */}
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {businesses.map((b) => {
          const isSelected = selectedBusinessId === b.id;
          return (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              // Selected markers turn Magenta (#EC008C), unselected are Cyan (#00FFFF)
              icon={createCmykIcon(isSelected ? "#EC008C" : "#00FFFF")}
              ref={(el) => {
                if (el) markerRefs.current[b.id] = el;
              }}
            >
              <Popup closeButton={false} className="cmyk-popup">
                <div className="p-4 bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(255,242,0,1)] min-w-[220px]">
                  {/* CMYK Header Strip */}
                  <div className="flex h-1.5 mb-3">
                    <div className="flex-1 bg-[#00FFFF]" />
                    <div className="flex-1 bg-[#EC008C]" />
                    <div className="flex-1 bg-[#FFF200]" />
                  </div>

                  <p className="font-black uppercase italic text-lg leading-none mb-1 text-[#1A1A1A]">
                    {b.name}
                  </p>
                  
                  <p className="font-mono text-[9px] text-gray-500 mb-4 uppercase tracking-tighter truncate font-bold">
                    LOC // {b.address}
                  </p>

                  <div className="flex items-center justify-between border-t-2 border-[#1A1A1A] pt-4">
                    <div className="flex items-center gap-1 font-black text-sm">
                      <Star size={14} fill="#EC008C" className="text-[#EC008C]" />
                      <span className="text-[#1A1A1A]">{b.rating.toFixed(1)}</span>
                    </div>
                    
                    <button
                      onClick={() => router.push(`/business/${b.id}`)}
                      className="bg-[#1A1A1A] text-white text-[9px] font-black font-mono uppercase px-4 py-2 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all flex items-center gap-2"
                    >
                      Access_Node <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Global CSS to strip Leaflet's default rounded styles for our industrial look */}
      <style jsx global>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .leaflet-popup-tip {
          background: #1A1A1A !important;
          border-radius: 0 !important;
          border: 2px solid #1A1A1A;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }
      `}</style>
    </div>
  );
}