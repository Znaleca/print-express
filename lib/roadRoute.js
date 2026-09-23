const ROUTING_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";

export function roadRouteUrl(points) {
  if (!Array.isArray(points) || points.length !== 2) return null;

  const coordinates = points.map((point) => {
    const lat = Number(point?.[0]);
    const lng = Number(point?.[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? `${lng},${lat}` : null;
  });

  if (coordinates.some((coordinate) => !coordinate)) return null;

  return `${ROUTING_ENDPOINT}/${coordinates.join(";")}?overview=full&geometries=geojson`;
}

export function parseRoadRoutePositions(payload) {
  const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];

  return coordinates
    .map(([lng, lat]) => [Number(lat), Number(lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}
