/**
 * Normalise a keyword or Maps query into a stable slug for `search_volumes` JSON keys
 * and suburb sorting (e.g. "Emergency Plumber!" → "emergency_plumber").
 */
export function slugifyKeywordForVolume(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
