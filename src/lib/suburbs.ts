import { createAdminClient } from "./supabase";
import { SuburbCoordinate } from "./types";

/**
 * Return all suburbs within `radiusKm` of (lat, lng).
 * Uses a bounding-box pre-filter then Haversine distance check.
 * Capped at 60 suburbs to keep DataforSEO costs predictable.
 */
export async function getSuburbsInRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  keyword: string
): Promise<SuburbCoordinate[]> {
  const supabase = createAdminClient();

  // 1 degree of latitude ≈ 111km
  const latDelta = radiusKm / 111;
  // longitude degrees shrink with latitude
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const { data, error } = await supabase
    .from("suburb_coordinates")
    .select("*")
    .gte("lat", lat - latDelta)
    .lte("lat", lat + latDelta)
    .gte("lng", lng - lngDelta)
    .lte("lng", lng + lngDelta)
    .not("dataforseo_location_name", "is", null)
    .limit(100); // over-fetch, then filter by exact radius

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Exact Haversine filter
  const filtered = (data as SuburbCoordinate[]).filter((s) => {
    const d = haversine(lat, lng, s.lat, s.lng);
    return d <= radiusKm;
  });

  // Sort by search volume for the given keyword (highest-volume suburbs first)
  const volKey = `search_volume_${keyword.toLowerCase().replace(/\s+/g, "_")}` as keyof SuburbCoordinate;
  filtered.sort((a, b) => {
    const va = (a[volKey] as number) ?? 0;
    const vb = (b[volKey] as number) ?? 0;
    return vb - va;
  });

  // Cap at 60 suburbs
  return filtered.slice(0, 60);
}

/**
 * Haversine great-circle distance in kilometres.
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Get the search volume for a keyword in a suburb.
 * Falls back to 0 if the column doesn't exist or has no data.
 */
export function getSuburbVolume(suburb: SuburbCoordinate, keyword: string): number {
  const colKey = `search_volume_${keyword.toLowerCase().replace(/[^a-z]/g, "_")}` as keyof SuburbCoordinate;
  return (suburb[colKey] as number) ?? 0;
}

/**
 * Build a cache key from the normalised URL, keyword, and radius.
 * Uses a simple deterministic string — no crypto dependency needed client-side.
 */
export function buildCacheKey(url: string, keyword: string, radiusKm: number): string {
  const normUrl = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  return `${normUrl}|${keyword.toLowerCase().trim()}|${radiusKm}`;
}
