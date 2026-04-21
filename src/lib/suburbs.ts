import { execute, query } from "./db";
import { SuburbCoordinate } from "./types";
import { getKeywordVolumes } from "./dataforseo";

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
  // 1 degree of latitude ≈ 111km
  const latDelta = radiusKm / 111;
  // longitude degrees shrink with latitude
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const rows = await query<SuburbCoordinate>(
    `SELECT * FROM suburb_coordinates
     WHERE lat >= $1 AND lat <= $2
       AND lng >= $3 AND lng <= $4
     LIMIT 100`,
    [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
  );

  if (rows.length === 0) return [];

  // Exact Haversine filter
  const filtered = rows.filter((s) => haversine(lat, lng, s.lat, s.lng) <= radiusKm);

  // Sort by search volume for the given keyword (highest-volume suburbs first)
  const volKey = `search_volume_${keyword.toLowerCase().replace(/\s+/g, "_")}` as keyof SuburbCoordinate;
  filtered.sort((a, b) => {
    const va = (a[volKey] as number) ?? 0;
    const vb = (b[volKey] as number) ?? 0;
    return vb - va;
  });

  return filtered.slice(0, 60);
}

/** Haversine great-circle distance in kilometres. */
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
 * Fetch live monthly volumes for "<keyword> <suburb>" phrases.
 * Uses 30-day DB cache first; missing entries are fetched via DataforSEO Keywords Data API.
 * Falls back to existing suburb static volume when live fetch/cache is unavailable.
 */
export async function fetchLiveSuburbVolumes(
  suburbs: Array<Pick<SuburbCoordinate, "suburb_id" | "name">>,
  keyword: string,
  fallbackRows?: SuburbCoordinate[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!suburbs.length) return result;

  const keywordBySuburb = new Map<string, string>();
  const suburbByKeyword = new Map<string, string>();
  for (const s of suburbs) {
    const phrase = `${keyword} ${s.name}`.replace(/\s+/g, " ").trim();
    keywordBySuburb.set(s.suburb_id, phrase);
    suburbByKeyword.set(phrase, s.suburb_id);
  }
  const phrases = Array.from(suburbByKeyword.keys());
  const nowIso = new Date().toISOString();

  // Ensure cache table exists (safe no-op when already present).
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS keyword_volume_cache (
        keyword TEXT PRIMARY KEY,
        monthly_volume INTEGER NOT NULL DEFAULT 0,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_kvc_expires
        ON keyword_volume_cache(expires_at)
    `);
  } catch (e) {
    console.warn("[suburbs] keyword volume cache bootstrap failed:", e);
  }

  // 1) Read non-expired cache entries.
  let cached: Array<{ keyword: string; monthly_volume: number }> = [];
  try {
    cached = await query<{ keyword: string; monthly_volume: number }>(
      `SELECT keyword, monthly_volume
       FROM keyword_volume_cache
       WHERE keyword = ANY($1::text[]) AND expires_at > $2`,
      [phrases, nowIso]
    );
  } catch (e) {
    // Cache table might not exist yet in some environments.
    console.warn("[suburbs] keyword volume cache query failed:", e);
  }

  const cacheMap = new Map<string, number>(cached.map((r) => [r.keyword, r.monthly_volume]));
  const missing = phrases.filter((p) => !cacheMap.has(p));

  // 2) Fetch missing phrases live from DataforSEO.
  if (missing.length > 0) {
    try {
      const liveMap = await getKeywordVolumes(missing);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      for (const kw of missing) {
        const liveVol = liveMap.get(kw);
        if (liveVol === undefined) continue; // No live value; keep fallback path.

        cacheMap.set(kw, liveVol);
        try {
          await execute(
            `INSERT INTO keyword_volume_cache (keyword, monthly_volume, fetched_at, expires_at)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (keyword) DO UPDATE
               SET monthly_volume = EXCLUDED.monthly_volume,
                   fetched_at     = NOW(),
                   expires_at     = EXCLUDED.expires_at`,
            [kw, liveVol, expiresAt]
          );
        } catch (e) {
          console.warn("[suburbs] cache upsert failed for keyword:", kw, e);
        }
      }
    } catch (e) {
      console.warn("[suburbs] live keyword volumes failed, using fallback:", e);
    }
  }

  // 3) Build Map<suburb_id, volume> with static fallback if needed.
  const fallbackBySuburb = new Map<string, number>();
  if (fallbackRows?.length) {
    for (const row of fallbackRows) {
      const sid = String(row.suburb_id);
      if (!sid) continue;
      fallbackBySuburb.set(sid, getSuburbVolume(row, keyword));
    }
  }

  for (const s of suburbs) {
    const phrase = keywordBySuburb.get(s.suburb_id);
    if (!phrase) {
      result.set(s.suburb_id, fallbackBySuburb.get(s.suburb_id) ?? 0);
      continue;
    }
    result.set(
      s.suburb_id,
      cacheMap.get(phrase) ?? fallbackBySuburb.get(s.suburb_id) ?? 0
    );
  }
  return result;
}

/**
 * Build a cache key from the normalised URL, keyword, and radius.
 */
export function buildCacheKey(url: string, keyword: string, radiusKm: number): string {
  const normUrl = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  return `${normUrl}|${keyword.toLowerCase().trim()}|${radiusKm}`;
}
