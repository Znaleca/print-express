"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { DEFAULT_MAP_CENTER, normalizeCoordinates } from "@/lib/coordinates";
import "leaflet/dist/leaflet.css";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const customIcon = new L.Icon({
  iconUrl: markerIcon.src || markerIcon,
  iconRetinaUrl: markerIcon2x.src || markerIcon2x,
  shadowUrl: markerShadow.src || markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const toPosition = (lat, lng) => {
  return normalizeCoordinates(lat, lng);
};

export default function LocationPicker({ lat, lng, onChange, readOnly = false, includedRadiusKm = null, maxRadiusKm = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const includedCircleRef = useRef(null);
  const maxCircleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [position, setPosition] = useState(() => toPosition(lat, lng));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Keep the local marker in sync when the parent loads or changes saved coordinates.
  useEffect(() => {
    const nextPosition = toPosition(lat, lng);
    setPosition((current) => (
      nextPosition && current?.lat === nextPosition.lat && current?.lng === nextPosition.lng
        ? current
        : nextPosition
    ));
  }, [lat, lng]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return undefined;

    let disposed = false;
    const initialPosition = toPosition(lat, lng) || DEFAULT_MAP_CENTER;
    const map = L.map(container, { scrollWheelZoom: true });
    map.setView([initialPosition.lat, initialPosition.lng], 13);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map);

    const setMapPosition = (nextPosition, notifyParent = true) => {
      if (disposed || !container.isConnected) return;

      setPosition(nextPosition);
      if (markerRef.current) {
        markerRef.current.setLatLng([nextPosition.lat, nextPosition.lng]);
      } else {
        markerRef.current = L.marker([nextPosition.lat, nextPosition.lng], { icon: customIcon }).addTo(map);
      }
      map.setView([nextPosition.lat, nextPosition.lng], map.getZoom(), { animate: false });
      if (notifyParent) onChangeRef.current?.(nextPosition.lat, nextPosition.lng);
    };

    const handleMapClick = (event) => {
      const nextPosition = toPosition(event.latlng.lat, event.latlng.lng);
      if (nextPosition) setMapPosition(nextPosition);
    };

    mapRef.current = map;
    if (!readOnly) map.on("click", handleMapClick);

    if (toPosition(lat, lng)) {
      markerRef.current = L.marker([initialPosition.lat, initialPosition.lng], { icon: customIcon }).addTo(map);
    }

    // The map can be mounted inside a responsive grid. Recalculate after its
    // first paint so Leaflet does not retain a zero-sized or stale container.
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (!disposed && mapRef.current === map && container.isConnected) {
        map.invalidateSize({ animate: false });
      }
    }) : null;
    resizeObserver?.observe(container);

    requestAnimationFrame(() => {
      if (!disposed && mapRef.current === map && container.isConnected) {
        map.invalidateSize({ animate: false });
      }
    });

    return () => {
      disposed = true;
      if (!readOnly) map.off("click", handleMapClick);
      resizeObserver?.disconnect();
      markerRef.current = null;
      includedCircleRef.current = null;
      maxCircleRef.current = null;
      if (mapRef.current === map) mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current?.isConnected) return;

    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      map.invalidateSize({ animate: false });
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([position.lat, position.lng]);
    } else {
      markerRef.current = L.marker([position.lat, position.lng], { icon: customIcon }).addTo(map);
    }
    map.setView([position.lat, position.lng], map.getZoom(), { animate: false });
    map.invalidateSize({ animate: false });
  }, [position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current?.isConnected) return;

    if (!position) {
      includedCircleRef.current?.remove();
      maxCircleRef.current?.remove();
      includedCircleRef.current = null;
      maxCircleRef.current = null;
      return;
    }

    const updateCircle = (circleRef, radiusKm, pathOptions) => {
      const radius = Number(radiusKm);
      if (!Number.isFinite(radius) || radius <= 0) {
        circleRef.current?.remove();
        circleRef.current = null;
        return;
      }
      if (!circleRef.current) circleRef.current = L.circle([position.lat, position.lng], { ...pathOptions, radius: radius * 1000 }).addTo(map);
      circleRef.current.setLatLng([position.lat, position.lng]);
      circleRef.current.setRadius(radius * 1000);
    };

    updateCircle(includedCircleRef, includedRadiusKm, {
      color: "#00AFC0",
      fillColor: "#00FFFF",
      fillOpacity: 0.12,
      weight: 2,
    });
    updateCircle(maxCircleRef, maxRadiusKm, {
      color: "#EC008C",
      fillColor: "#EC008C",
      fillOpacity: 0.04,
      weight: 2,
      dashArray: "7 7",
    });
  }, [position, includedRadiusKm, maxRadiusKm]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Shop location map"
      style={{
        height: "100%",
        width: "100%",
        border: "2px solid #1A1A1A",
        borderRadius: "8px",
        overflow: "hidden",
        position: "relative",
        zIndex: 0,
        isolation: "isolate",
        background: "#f9f9f7",
      }}
    />
  );
}
