/**
 * Suburb Data Seeder
 *
 * Seeds the suburb_coordinates table from the ABS ASGS GeoJSON files.
 *
 * Prerequisites:
 *   1. Download ABS ASGS Edition 3 Suburbs GeoJSON:
 *      https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3
 *      → "Suburb and Locality" → GeoJSON format
 *   2. Simplify polygons:
 *      npm install -g mapshaper
 *      mapshaper aus_suburbs.geojson -simplify 10% -o data/aus_suburbs.geojson
 *   3. Ensure DATABASE_URL is set in .env.local
 *
 * Run: npx tsx scripts/seed-suburbs.ts ./data/aus_suburbs.geojson
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface ABSFeature {
  type: "Feature";
  properties: {
    SAL_NAME21: string;
    STE_NAME21: string;
    POSTCODE: string;
    AREA_SQKM: number;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

const STATE_MAP: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "Western Australia": "WA",
  "South Australia": "SA",
  "Tasmania": "TAS",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "NT",
};

function getCentroid(geometry: ABSFeature["geometry"]): { lat: number; lng: number } {
  let coords: number[][];
  if (geometry.type === "Polygon") {
    coords = geometry.coordinates[0] as number[][];
  } else {
    const polys = geometry.coordinates as number[][][][];
    polys.sort((a, b) => b[0].length - a[0].length);
    coords = polys[0][0];
  }
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  return {
    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
  };
}

function buildDataforSEOLocationName(suburb: string, state: string): string {
  const stateName =
    Object.entries(STATE_MAP).find(([, code]) => code === state)?.[0] ?? state;
  return `${suburb},${stateName},Australia`;
}

async function main() {
  const geojsonPath = process.argv[2] ?? "./data/aus_suburbs.geojson";

  if (!fs.existsSync(geojsonPath)) {
    console.error(`GeoJSON file not found: ${geojsonPath}`);
    process.exit(1);
  }

  console.log(`Loading GeoJSON from ${geojsonPath}...`);
  const raw = fs.readFileSync(geojsonPath, "utf-8");
  const geojson = JSON.parse(raw) as { features: ABSFeature[] };
  console.log(`Found ${geojson.features.length} suburbs. Seeding...`);

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < geojson.features.length; i += BATCH_SIZE) {
    const batch = geojson.features.slice(i, i + BATCH_SIZE);

    for (const feature of batch) {
      const props = feature.properties;
      const state = STATE_MAP[props.STE_NAME21] ?? props.STE_NAME21;
      const centroid = getCentroid(feature.geometry);
      const locationName = buildDataforSEOLocationName(props.SAL_NAME21, state);

      try {
        await pool.query(
          `INSERT INTO suburb_coordinates (name, state, postcode, lat, lng, dataforseo_location_name, geojson_polygon)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (name, state) DO NOTHING`,
          [
            props.SAL_NAME21,
            state,
            props.POSTCODE ?? "",
            centroid.lat,
            centroid.lng,
            locationName,
            JSON.stringify(feature.geometry),
          ]
        );
        inserted++;
      } catch (err) {
        console.warn(`Skipped ${props.SAL_NAME21}: ${err}`);
      }
    }

    process.stdout.write(`\rInserted: ${inserted}/${geojson.features.length}`);
  }

  console.log(`\n\nDone. ${inserted} suburbs seeded.`);
  console.log("Next: run seed-search-volumes.ts to populate search volume columns.");
  await pool.end();
}

main().catch(console.error);
