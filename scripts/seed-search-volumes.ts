/**
 * Search Volume Seeder
 *
 * Populates the search_volume_[keyword] columns in suburb_coordinates.
 *
 * Two modes:
 *
 *   --mode=estimate  (default, FREE)
 *     Estimates suburb volumes by distributing a known AU national monthly
 *     volume proportionally across suburbs using population data.
 *     Runs in seconds. Good enough for the MVP.
 *
 *   --mode=dataforseo  (ACCURATE, uses API credits)
 *     Queries DataforSEO Google Ads keyword volume API for each keyword
 *     at the suburb level. Takes ~10-20 minutes. Costs ~AUD $3-5.
 *     Use this after launch to improve scoring accuracy.
 *
 * Prerequisites (both modes):
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in env
 *   - suburb_coordinates table already seeded with name/state/population
 *
 * Additional (dataforseo mode):
 *   - DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD set in env
 *
 * Run:
 *   npx tsx scripts/seed-search-volumes.ts --mode=estimate
 *   npx tsx scripts/seed-search-volumes.ts --mode=dataforseo
 */

import { Pool } from "pg";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN!;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD!;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Target keywords (must match column names: search_volume_[keyword])
const KEYWORDS = [
  "plumber",
  "electrician",
  "dentist",
  "cleaner",
  "mechanic",
  "painter",
  "plaster",
  "locksmith",
  "roofer",
  "landscaper",
];

// Australian national monthly search volumes (approx, from public sources).
// These are the total national volumes — we distribute them proportionally.
// Update these with your DataforSEO research findings over time.
const AU_NATIONAL_MONTHLY_VOLUME: Record<string, number> = {
  plumber:      135_000,
  electrician:   90_000,
  dentist:      201_000,
  cleaner:       74_000,
  mechanic:      82_000,
  painter:       49_000,
  plaster:        8_100,
  locksmith:     22_000,
  roofer:        12_000,
  landscaper:    27_000,
};

const AU_TOTAL_POPULATION = 26_500_000;

// DataforSEO API
const DFS_BASE = "https://api.dataforseo.com/v3";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function dfsAuth(): string {
  return "Basic " + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface SuburbRow {
  suburb_id: string;
  name: string;
  state: string;
  population: number | null;
  dataforseo_location_name: string | null;
}

// ─────────────────────────────────────────────────────────────
// Mode 1: Population-proportional estimation
// ─────────────────────────────────────────────────────────────

async function runEstimateMode() {
  console.log("Mode: ESTIMATE (population-proportional)\n");

  // Fetch all suburbs
  let allSuburbs: SuburbRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const result = await pool.query(
      "SELECT suburb_id, name, state, population FROM suburb_coordinates LIMIT $1 OFFSET $2",
      [pageSize, from]
    );
    const data: SuburbRow[] = result.rows;
    if (data.length === 0) break;
    allSuburbs = allSuburbs.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Loaded ${allSuburbs.length} suburbs from database.`);

  // Calculate total population from data (fallback to AU total if missing)
  const totalPop = allSuburbs.reduce((sum, s) => sum + (s.population ?? 0), 0);
  const effectiveTotalPop = totalPop > 0 ? totalPop : AU_TOTAL_POPULATION;

  console.log(`Total population in data: ${effectiveTotalPop.toLocaleString()}`);
  console.log(`Distributing volumes for ${KEYWORDS.length} keywords...\n`);

  // Batch update
  const UPDATE_BATCH = 500;
  let updated = 0;

  for (let i = 0; i < allSuburbs.length; i += UPDATE_BATCH) {
    const batch = allSuburbs.slice(i, i + UPDATE_BATCH);

    const updates = batch.map((suburb) => {
      const pop = suburb.population ?? 500; // default 500 if missing
      const ratio = pop / effectiveTotalPop;

      const volumeCols: Record<string, number> = {};
      for (const kw of KEYWORDS) {
        const national = AU_NATIONAL_MONTHLY_VOLUME[kw] ?? 10_000;
        // Minimum 10 searches/month per suburb to avoid zero weighting
        volumeCols[`search_volume_${kw}`] = Math.max(Math.round(national * ratio), 10);
      }

      return { suburb_id: suburb.suburb_id, ...volumeCols };
    });

    for (const u of updates) {
      const cols = Object.keys(u).filter((k) => k !== "suburb_id");
      const sets = cols.map((c, idx) => `${c} = $${idx + 2}`).join(", ");
      const vals = cols.map((c) => (u as Record<string, unknown>)[c]);
      try {
        await pool.query(
          `UPDATE suburb_coordinates SET ${sets} WHERE suburb_id = $1`,
          [u.suburb_id, ...vals]
        );
      } catch (err) {
        console.warn(`Row error for ${u.suburb_id}:`, err);
      }
    }
    updated += batch.length;
    process.stdout.write(`\rUpdated: ${updated}/${allSuburbs.length}`);
  }

  console.log(`\n\nDone. ${updated} suburbs updated with estimated volumes.`);
  console.log("Run --mode=dataforseo later to replace with accurate DataforSEO volumes.");
  await pool.end();
}

// ─────────────────────────────────────────────────────────────
// Mode 2: DataforSEO Google Ads keyword volume
// ─────────────────────────────────────────────────────────────

async function runDataforSEOMode() {
  console.log("Mode: DATAFORSEO (accurate keyword volumes)\n");

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    console.error("Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD");
    process.exit(1);
  }

  // Fetch all suburbs (with location names)
  let allSuburbs: SuburbRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const result = await pool.query(
      "SELECT suburb_id, name, state, population, dataforseo_location_name FROM suburb_coordinates LIMIT $1 OFFSET $2",
      [pageSize, from]
    );
    const data: SuburbRow[] = result.rows;
    if (data.length === 0) break;
    allSuburbs = allSuburbs.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Loaded ${allSuburbs.length} suburbs.`);

  // DataforSEO approach: for each keyword, submit a bulk location-based volume task
  // API: POST /keywords_data/google_ads/search_volume/live
  // Each request: up to 1000 keywords, location_name = suburb,State,Australia
  // Cost: ~$0.0001 per keyword = ~$0.001 per suburb per keyword
  // Total: 15000 suburbs × 10 keywords × $0.0001 = ~$15

  const BATCH_SIZE = 500; // suburbs per API call
  const RATE_LIMIT_MS = 1000; // 1 second between batches

  let totalUpdated = 0;

  for (const keyword of KEYWORDS) {
    console.log(`\nProcessing keyword: ${keyword}`);
    const col = `search_volume_${keyword}`;

    for (let i = 0; i < allSuburbs.length; i += BATCH_SIZE) {
      const batch = allSuburbs.slice(i, i + BATCH_SIZE);

      // Build keyword+location pairs
      const tasks = batch
        .filter((s) => s.dataforseo_location_name)
        .map((s) => ({
          keywords: [keyword],
          location_name: s.dataforseo_location_name,
          language_name: "English",
          search_partners: false,
          date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          date_to: new Date().toISOString().split("T")[0],
        }));

      if (tasks.length === 0) continue;

      try {
        const res = await fetch(
          `${DFS_BASE}/keywords_data/google_ads/search_volume/live`,
          {
            method: "POST",
            headers: {
              Authorization: dfsAuth(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify(tasks),
          }
        );

        if (!res.ok) {
          console.warn(`  API error ${res.status} for batch ${i}`);
          await sleep(RATE_LIMIT_MS * 2);
          continue;
        }

        const json = await res.json();

        // Map results back to suburb_ids
        const updates: Array<{ suburb_id: string; [key: string]: number | string }> = [];

        for (let b = 0; b < batch.length; b++) {
          const suburb = batch[b];
          const task = json.tasks?.[b];
          const result = task?.result?.[0];
          const volume = result?.items?.[0]?.search_volume ?? 0;

          updates.push({
            suburb_id: suburb.suburb_id,
            [col]: Math.max(volume, 0),
          });
        }

        // Update volumes
        for (const u of updates) {
          try {
            await pool.query(
              `UPDATE suburb_coordinates SET "${col}" = $1 WHERE suburb_id = $2`,
              [(u as Record<string, unknown>)[col], u.suburb_id]
            );
          } catch (uErr) {
            console.warn(`  Row error:`, uErr);
          }
        }
        totalUpdated += updates.length;
        process.stdout.write(
          `\r  ${keyword}: ${Math.min(i + BATCH_SIZE, allSuburbs.length)}/${allSuburbs.length} suburbs`
        );
      } catch (err) {
        console.warn(`  Batch error: ${err}`);
      }

      await sleep(RATE_LIMIT_MS);
    }

    console.log(`\n  ${keyword}: complete.`);
  }

  console.log(`\n\nDone. ${totalUpdated} suburb×keyword volumes updated from DataforSEO.`);
  await pool.end();
}

// ─────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────

const mode = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "estimate";

if (mode === "dataforseo") {
  runDataforSEOMode().catch(console.error);
} else if (mode === "estimate") {
  runEstimateMode().catch(console.error);
} else {
  console.error(`Unknown mode: ${mode}. Use --mode=estimate or --mode=dataforseo`);
  process.exit(1);
}
