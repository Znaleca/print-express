"use client";

import { useEffect, useMemo, useState } from "react";
import { Polyline, useMap } from "react-leaflet";
import { parseRoadRoutePositions, roadRouteUrl } from "@/lib/roadRoute";

const routeCache = new Map();

export default function RoadRoute({ points }) {
  const map = useMap();
  const [positions, setPositions] = useState([]);
  const routeKey = useMemo(
    () => (Array.isArray(points) ? points.map((point) => point.join(",")).join(";") : ""),
    [points]
  );
  const url = roadRouteUrl(points);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setPositions([]);
    if (!url) return () => controller.abort();

    const cachedPositions = routeCache.get(routeKey);
    if (cachedPositions) {
      setPositions(cachedPositions);
      map.fitBounds(cachedPositions, { padding: [48, 48], maxZoom: 15 });
      return () => controller.abort();
    }

    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Road route request failed: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const nextPositions = parseRoadRoutePositions(payload);
        if (cancelled || nextPositions.length < 2) return;

        routeCache.set(routeKey, nextPositions);
        setPositions(nextPositions);
        map.fitBounds(nextPositions, { padding: [48, 48], maxZoom: 15 });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          // Keep the map usable without drawing a misleading straight line.
          setPositions([]);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [map, routeKey, url]);

  if (positions.length < 2) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: "#EC008C",
        weight: 4,
        dashArray: "10 8",
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }}
    />
  );
}
