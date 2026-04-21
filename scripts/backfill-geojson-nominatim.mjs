/**
 * One-time (or occasional) backfill of suburb_coordinates.geojson_polygon using
 * OpenStreetMap Nominatim. Run against Railway Postgres so the map matches a
 * local DB that was seeded with ABS GeoJSON.
 *
 * Nominatim usage policy: max ~1 request/second; identify your app in User-Agent.
 *
 * Usage:
 *   Set DATABASE_URL and NOMINATIM_CONTACT_EMAIL (your real email for OSM).
 *   From repo root:
 *     node scripts/backfill-geojson-nominatim.mjs
 *
 * Or with Railway CLI proxy / copied connection string:
 *     DATABASE_URL="postgresql://..." NOMINATIM_CONTACT_EMAIL="you@company.com" node scripts/backfill-geojson-nominatim.mjs
 *
 * Optional: LIMIT=50   — only process first 50 missing rows (for testing)
 */

import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
const CONTACT = process.env.NOMINATIM_CONTACT_EMAIL?.trim();
const DELAY_MS = 1100;
const MAX_ROWS = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!CONTACT || !CONTACT.includes("@")) {
  console.error(
    "NOMINATIM_CONTACT_EMAIL must be set to a real address (OpenStreetMap fair-use policy)."
  );
  process.exit(1);
}

const USER_AGENT = `SERPMapper/1.0 (https://trafficradius.com.au; contact: ${CONTACT})`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

/**
 * @param {string} name
 * @param {string} state
 * @returns {Promise<object | null>} GeoJSON Polygon or MultiPolygon, or null
 */
async function fetchPolygonFromNominatim(name, state) {
  const q = `${name}, ${state}, Australia`;
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      polygon_geojson: "1",
      countrycodes: "au",
      limit: "8",
    });

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.warn(`  HTTP ${res.status} for "${q}"`);
    return null;
  }

  /** @type {Array<{ geojson?: { type: string }; class?: string; type?: string; importance?: number }>} */
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const scored = data
    .map((hit, i) => {
      const g = hit.geojson;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
      let score = hit.importance ?? 0;
      const t = (hit.type || "").toLowerCase();
      const c = (hit.class || "").toLowerCase();
      if (t.includes("suburb") || t.includes("neighbourhood") || t.includes("quarter")) score += 5;
      if (c === "boundary" || c === "place") score += 2;
      if (t === "administrative") score -= 1;
      return { g, score, i };
    })
    .filter(Boolean);

  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored[0]?.g ?? null;
}

async function main() {
  const client = await pool.connect();
  try {
    const limitSql =
      MAX_ROWS != null && Number.isFinite(MAX_ROWS) && MAX_ROWS > 0
        ? `LIMIT ${Math.floor(MAX_ROWS)}`
        : "";
    const { rows } = await client.query(`
      SELECT suburb_id, name, state
      FROM suburb_coordinates
      WHERE geojson_polygon IS NULL
      ORDER BY state, name
      ${limitSql}
    `);

    console.log(`Found ${rows.length} suburbs without polygons. Delay ${DELAY_MS}ms between requests.\n`);

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));

      process.stdout.write(`[${i + 1}/${rows.length}] ${row.name}, ${row.state} … `);

      try {
        const geojson = await fetchPolygonFromNominatim(row.name, row.state);
        if (!geojson) {
          console.log("no polygon");
          fail++;
          continue;
        }
        await client.query(
          `UPDATE suburb_coordinates SET geojson_polygon = $1::jsonb WHERE suburb_id = $2`,
          [JSON.stringify(geojson), row.suburb_id]
        );
        console.log("saved");
        ok++;
      } catch (e) {
        console.log("error", e?.message || e);
        fail++;
      }
    }

    console.log(`\nDone. Updated: ${ok}, skipped/errors: ${fail}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
