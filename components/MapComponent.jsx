"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";

// Fix for default Leaflet icons in Next.js
const customIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapController({ center, selectedBusinessId, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15, { animate: true });
    }

    // Programmatically open the popup of the selected marker
    if (selectedBusinessId && markerRefs.current[selectedBusinessId]) {
      markerRefs.current[selectedBusinessId].openPopup();
    }
  }, [center, selectedBusinessId, map, markerRefs]);

  return null;
}

export default function MapComponent({ businesses, selectedBusinessId }) {
  const router = useRouter();
  const markerRefs = useRef({}); // Store marker instances here
  const defaultCenter = [14.6806, 120.5375];

  const selected = businesses.find((b) => b.id === selectedBusinessId);
  const center = selected ? [selected.lat, selected.lng] : defaultCenter;

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={true}
      className="z-0" // Ensure it stays behind navbar
    >
      <MapController
        center={center}
        selectedBusinessId={selectedBusinessId}
        markerRefs={markerRefs}
      />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {businesses.map((b) => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={customIcon}
          ref={(el) => {
            if (el) markerRefs.current[b.id] = el; // Assign marker to ref object
          }}
        >
          <Popup>
            <div className="p-1 min-w-[160px] font-sans">
              <p className="font-black uppercase italic text-sm mb-1">{b.name}</p>
              <p className="text-[10px] font-mono text-gray-500 mb-2 uppercase">{b.address}</p>
              <div className="flex items-center justify-between border-t pt-2 border-black/10">
                <span className="text-black font-black text-xs">⭐ {b.rating.toFixed(1)}</span>
                <button
                  onClick={() => router.push(`/business/${b.id}`)}
                  className="bg-black text-white text-[10px] font-mono uppercase px-3 py-1 hover:bg-[#FF3E00] transition-colors"
                >
                  View Details
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}