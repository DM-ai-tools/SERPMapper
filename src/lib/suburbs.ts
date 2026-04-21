import { execute, query } from "./db";
import { SuburbCoordinate } from "./types";
import {
  getKeywordVolumes,
  getKeywordVolumesByLocationTasks,
  normaliseVolumeKeyword,
} from "./dataforseo";

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
  suburbs: Array<Pick<SuburbCoordinate, "suburb_id" | "name" | "dataforseo_location_name">>,
  keyword: string,
  fallbackRows?: SuburbCoordinate[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!suburbs.length) return result;

  const keywordsBySuburb = new Map<string, string[]>();
  const allPhrases = new Set<string>();
  for (const s of suburbs) {
    const phrases = [
      `${keyword} ${s.name}`,
      `${keyword} in ${s.name}`,
      `${s.name} ${keyword}`,
    ]
      .map((p) => normaliseVolumeKeyword(p))
      .filter(Boolean);
    const uniquePhrases = Array.from(new Set(phrases));
    keywordsBySuburb.set(s.suburb_id, uniquePhrases);
    for (const phrase of uniquePhrases) allPhrases.add(phrase);
  }
  const phrases = Array.from(allPhrases);
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

  // Treat 0/invalid cached values as non-authoritative to avoid "stuck at zero" volumes.
  const cacheMap = new Map<string, number>();
  for (const row of cached) {
    const key = normaliseVolumeKeyword(row.keyword);
    const vol = Number(row.monthly_volume);
    if (!key || !Number.isFinite(vol) || vol <= 0) continue;
    cacheMap.set(key, Math.round(vol));
  }
  const missing = phrases.filter((p) => !cacheMap.has(p));

  // 2) Fetch missing phrases live from DataforSEO.
  if (missing.length > 0) {
    try {
      const liveMap = await getKeywordVolumes(missing);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      for (const kw of missing) {
        const liveVolRaw = liveMap.get(normaliseVolumeKeyword(kw));
        const liveVol = Number.isFinite(liveVolRaw) ? Math.max(0, Math.round(liveVolRaw as number)) : undefined;
        if (liveVol === undefined || liveVol <= 0) continue; // Keep fallback path for zero/no-data.

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
    const phrasesForSuburb = keywordsBySuburb.get(s.suburb_id) ?? [];
    const fallbackVol = fallbackBySuburb.get(s.suburb_id);
    if (!phrasesForSuburb.length) {
      result.set(s.suburb_id, fallbackVol && fallbackVol > 0 ? fallbackVol : 0);
      continue;
    }
    const bestLiveVol = phrasesForSuburb.reduce((best, phrase) => {
      const vol = cacheMap.get(phrase);
      if (!Number.isFinite(vol) || (vol as number) <= 0) return best;
      return Math.max(best, vol as number);
    }, 0);
    result.set(
      s.suburb_id,
      bestLiveVol > 0
        ? bestLiveVol
        : (fallbackVol && fallbackVol > 0 ? fallbackVol : 0)
    );
  }

  // 4) For remaining zero values, query DataforSEO with suburb location context.
  const zeroSuburbs = suburbs.filter((s) => (result.get(s.suburb_id) ?? 0) <= 0);
  if (zeroSuburbs.length > 0) {
    const lookupTasks = zeroSuburbs.flatMap((s) => {
      const locationName = s.dataforseo_location_name?.trim() || undefined;
      const phrases = keywordsBySuburb.get(s.suburb_id) ?? [];
      return phrases.map((phrase, idx) => ({
        tag: `${s.suburb_id}__${idx}`,
        keyword: phrase,
        location_name: locationName,
      }));
    });

    try {
      const liveByTag = await getKeywordVolumesByLocationTasks(lookupTasks);
      const bestBySuburb = new Map<string, number>();
      liveByTag.forEach((vol, tag) => {
        const suburbId = tag.split("__")[0];
        if (!suburbId) return;
        const prev = bestBySuburb.get(suburbId) ?? 0;
        if (vol > prev) bestBySuburb.set(suburbId, vol);
      });
      bestBySuburb.forEach((vol, suburbId) => {
        if (vol > 0) result.set(suburbId, vol);
      });
    } catch (e) {
      console.warn("[suburbs] location-aware keyword volumes failed:", e);
    }
  }

  // 5) If live/fallback is too sparse (e.g. only city term has volume), infer
  //    non-zero suburb volumes from base keyword demand so ranked suburbs don't
  //    look impossible (position with 0/mo).
  const resolved = Array.from(result.values());
  const positiveCount = resolved.filter((v) => Number.isFinite(v) && v > 0).length;
  const sparseThreshold = Math.max(1, Math.floor(suburbs.length * 0.1)); // <=10% positive = sparse

  if (positiveCount <= sparseThreshold) {
    try {
      const baseMap = await getKeywordVolumes([normaliseVolumeKeyword(keyword)]);
      const baseKeywordVolume = baseMap.get(normaliseVolumeKeyword(keyword)) ?? 0;
      if (baseKeywordVolume > 0) {
        const zeroSuburbs = suburbs.filter((s) => (result.get(s.suburb_id) ?? 0) <= 0);
        if (zeroSuburbs.length > 0) {
          const popBySuburb = new Map<string, number>();
          if (fallbackRows?.length) {
            for (const row of fallbackRows) {
              const sid = String(row.suburb_id);
              const pop = Number(row.population ?? 0);
              if (sid && Number.isFinite(pop) && pop > 0) {
                popBySuburb.set(sid, pop);
              }
            }
          }
          const totalPop = zeroSuburbs.reduce(
            (sum, s) => sum + (popBySuburb.get(s.suburb_id) ?? 0),
            0
          );

          // If we don't have population data, don't assign identical values.
          if (totalPop <= 0) {
            return result;
          }

          for (const s of zeroSuburbs) {
            const ratio = (popBySuburb.get(s.suburb_id) ?? 0) / totalPop;
            const estimated = Math.max(1, Math.round(baseKeywordVolume * ratio));
            result.set(s.suburb_id, estimated);
          }
        }
      }
    } catch (e) {
      console.warn("[suburbs] inferred volume fallback failed:", e);
    }
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
