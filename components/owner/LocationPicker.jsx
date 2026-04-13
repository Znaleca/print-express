"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const customIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapEvents({ setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return null;
}

function CenterToMarker({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange }) {
  const [position, setPosition] = useState(lat && lng ? { lat, lng } : null);
  const defaultCenter = [14.6806, 120.5375]; // Default to Balanga, Bataan, Philippines

  // Ensure map updates position properly from props, but not if user drags
  useEffect(() => {
    if (lat && lng && (!position || lat !== position.lat || lng !== position.lng)) {
      setPosition({ lat, lng });
    }
  }, [lat, lng]);

  const handlePositionChange = (pos) => {
    setPosition(pos);
    if (onChange) {
      onChange(pos.lat, pos.lng);
    }
  };

  return (
    <div style={{ height: "300px", width: "100%", border: "2px solid #1A1A1A", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={position || defaultCenter}
        zoom={13}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents setPosition={handlePositionChange} />
        {position && (
          <>
            <CenterToMarker position={position} />
            <Marker position={position} icon={customIcon} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
