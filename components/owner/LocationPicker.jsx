"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { DEFAULT_MAP_CENTER, normalizeCoordinates } from "@/lib/coordinates";
import { parseRoadRoutePositions, roadRouteUrl } from "@/lib/roadRoute";
import "leaflet/dist/leaflet.css";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ROAD_ROUTE_STYLE = {
  color: "#EC008C",
  weight: 4,
  dashArray: "10 8",
  opacity: 0.9,
  lineCap: "round",
  lineJoin: "round",
};
const routeCache = new Map();

const shopLocationIcon = new L.DivIcon({
  className: "checkout-shop-pin-marker",
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background: #EC008C;
      border: 3px solid #1A1A1A;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
    ">
      <div style="width: 11px; height: 11px; border: 2px solid #1A1A1A; border-radius: 50%; background: #FFFFFF; transform: rotate(45deg);"></div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const customerLocationIcon = new L.DivIcon({
  className: "checkout-customer-location-marker",
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
    " role="img" aria-label="Your delivery location" title="Your delivery location">
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

const toPosition = (lat, lng) => {
  return normalizeCoordinates(lat, lng);
};

const createMarker = (map, nextPosition, readOnly, onPositionChange, icon) => {
  const marker = L.marker([nextPosition.lat, nextPosition.lng], {
    icon,
    draggable: !readOnly,
  }).addTo(map);

  if (!readOnly) {
    marker.on("dragend", (event) => {
      const markerPosition = event.target.getLatLng();
      const normalizedPosition = toPosition(markerPosition.lat, markerPosition.lng);
      if (normalizedPosition) onPositionChange(normalizedPosition);
    });
  }

  return marker;
};

export default function LocationPicker({ lat, lng, onChange, readOnly = false, routePoints = null, markerType = "shop" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const routeShopMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [position, setPosition] = useState(() => toPosition(lat, lng));
  const markerIcon = markerType === "customer" ? customerLocationIcon : shopLocationIcon;
  const normalizedRoutePoints = useMemo(
    () => (Array.isArray(routePoints)
      ? routePoints
        .map((point) => (Array.isArray(point) ? toPosition(point[0], point[1]) : toPosition(point?.lat, point?.lng)))
        .filter(Boolean)
      : []),
    [routePoints]
  );
  const routeKey = normalizedRoutePoints.map((point) => `${point.lat},${point.lng}`).join(";");
  const routeUrl = roadRouteUrl(normalizedRoutePoints.map((point) => [point.lat, point.lng]));
  const routeShopPosition = normalizedRoutePoints[0] || null;
  const routeShopLat = routeShopPosition?.lat ?? null;
  const routeShopLng = routeShopPosition?.lng ?? null;

  const notifyPositionChange = (nextPosition) => {
    setPosition(nextPosition);
    onChangeRef.current?.(nextPosition.lat, nextPosition.lng);
  };

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Keep the local marker in sync when the parent loads or changes saved coordinates.
  useEffect(() => {
    const nextPosition = toPosition(lat, lng);
    setPosition((current) => {
      if (!nextPosition) return null;
      return current?.lat === nextPosition.lat && current?.lng === nextPosition.lng
        ? current
        : nextPosition;
    });
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
        markerRef.current = createMarker(map, nextPosition, readOnly, notifyPositionChange, markerIcon);
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
      markerRef.current = createMarker(map, initialPosition, readOnly, notifyPositionChange, markerIcon);
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
      if (mapRef.current === map) mapRef.current = null;
      map.remove();
    };
    // Leaflet owns this DOM node for the component lifetime. Prop changes are
    // synchronized by the focused effects below instead of recreating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      markerRef.current = createMarker(map, position, readOnly, notifyPositionChange, markerIcon);
    }
    map.setView([position.lat, position.lng], map.getZoom(), { animate: false });
    map.invalidateSize({ animate: false });
  }, [position, readOnly, markerIcon]);

  useEffect(() => {
    const map = mapRef.current;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    routeShopMarkerRef.current?.remove();
    routeShopMarkerRef.current = null;
    if (!map || !routeUrl || routeShopLat === null || routeShopLng === null) return undefined;

    routeShopMarkerRef.current = L.marker([routeShopLat, routeShopLng], {
      icon: shopLocationIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 900,
    }).addTo(map);

    let cancelled = false;
    const controller = new AbortController();
    const drawRoute = (positions) => {
      if (cancelled || !mapRef.current || positions.length < 2) return;
      const routeLayer = L.polyline(positions, ROAD_ROUTE_STYLE).addTo(map);
      routeLayer.bringToBack();
      routeLayerRef.current = routeLayer;
      map.fitBounds(positions, { padding: [40, 40], maxZoom: 16 });
    };

    const cachedPositions = routeCache.get(routeKey);
    if (cachedPositions) {
      drawRoute(cachedPositions);
      return () => controller.abort();
    }

    fetch(routeUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Road route request failed: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const positions = parseRoadRoutePositions(payload);
        if (cancelled || positions.length < 2) return;
        routeCache.set(routeKey, positions);
        drawRoute(positions);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          // Keep the pin usable if the routing service is unavailable.
          console.warn("Road route unavailable:", error?.message || error);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      routeShopMarkerRef.current?.remove();
      routeShopMarkerRef.current = null;
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
    };
  }, [routeKey, routeUrl, routeShopLat, routeShopLng]);

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
