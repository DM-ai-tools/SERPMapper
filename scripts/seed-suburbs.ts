/**
 * Suburb Data Seeder
 *
 * Seeds the suburb_coordinates table from the ABS ASGS GeoJSON files.
 * After running this, run seed-search-volumes.ts to populate search volume columns.
 *
 * Prerequisites:
 *   1. Download ABS ASGS Edition 3 Suburbs GeoJSON:
 *      https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
 *      File: "Suburb and Locality" → download GeoJSON format
 *   2. Simplify polygons to reduce file size (required — raw file is ~300MB):
 *      npm install -g mapshaper
 *      mapshaper aus_suburbs.geojson -simplify 10% -o data/aus_suburbs.geojson
 *   3. Ensure env vars are set: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npx tsx scripts/seed-suburbs.ts ./data/aus_suburbs.geojson
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ABSFeature {
  type: "Feature";
  properties: {
    SAL_NAME21: string;  // Suburb name
    STE_NAME21: string;  // State name
    POSTCODE: string;
    AREA_SQKM: number;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

// Map ABS state names to codes
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
    // MultiPolygon — use the first ring of the largest polygon
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

// Build the DataforSEO location_name string for a suburb.
// Format required by DataforSEO Local Pack API: "SuburbName,StateName,Australia"
function buildDataforSEOLocationName(suburb: string, state: string): string {
  const stateName =
    Object.entries(STATE_MAP).find(([, code]) => code === state)?.[0] ?? state;
  return `${suburb},${stateName},Australia`;
}

async function main() {
  const geojsonPath = process.argv[2] ?? "./data/aus_suburbs.geojson";

  if (!fs.existsSync(geojsonPath)) {
    console.error(`GeoJSON file not found: ${geojsonPath}`);
    console.error("Download and simplify the ABS ASGS suburb boundaries first.");
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
    const rows = batch.map((feature) => {
      const props = feature.properties;
      const state = STATE_MAP[props.STE_NAME21] ?? props.STE_NAME21;
      const centroid = getCentroid(feature.geometry);
      const locationName = buildDataforSEOLocationName(props.SAL_NAME21, state);

      return {
        name: props.SAL_NAME21,
        state,
        postcode: props.POSTCODE ?? "",
        lat: centroid.lat,
        lng: centroid.lng,
        dataforseo_location_name: locationName,
        geojson_polygon: feature.geometry,
      };
    });

    const { error } = await supabase
      .from("suburb_coordinates")
      .upsert(rows, { onConflict: "name,state", ignoreDuplicates: true });

    if (error) {
      console.error(`Batch ${i}–${i + BATCH_SIZE} error:`, error.message);
    } else {
      inserted += rows.length;
      console.log(`Inserted ${inserted}/${geojson.features.length}`);
    }
  }

  console.log(`\nDone. ${inserted} suburbs seeded.`);
  console.log("Next step: run seed-search-volumes.ts to populate search volume columns:");
  console.log("  npx tsx scripts/seed-search-volumes.ts --mode=estimate");
}

main().catch(console.error);
