export const DEFAULT_MAP_CENTER = Object.freeze({ lat: 14.6806, lng: 120.5375 });

/**
 * Convert a database/browser coordinate pair into a safe Leaflet position.
 * Empty values are deliberately rejected so null does not become 0,0.
 */
export function normalizeCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (typeof lat === "string" && lat.trim() === "") return null;
  if (typeof lng === "string" && lng.trim() === "") return null;

  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) return null;
  if (normalizedLat < -90 || normalizedLat > 90) return null;
  if (normalizedLng < -180 || normalizedLng > 180) return null;

  return { lat: normalizedLat, lng: normalizedLng };
}

export function coordinatesToLeafletPosition(lat, lng) {
  const coordinates = normalizeCoordinates(lat, lng);
  return coordinates ? [coordinates.lat, coordinates.lng] : null;
}
