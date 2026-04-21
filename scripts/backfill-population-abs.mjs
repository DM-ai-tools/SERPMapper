#!/usr/bin/env node
/**
 * Backfill suburb population from ABS Census CSV.
 *
 * Usage:
 *   node scripts/backfill-population-abs.mjs --file path/to/abs-population.csv
 *
 * Expected CSV columns (header names are matched loosely):
 *   - suburb/locality name (e.g. suburb, locality, suburblocality)
 *   - state (e.g. state, stateabbrev, state_abbrev)
 *   - population (e.g. population, persons, total_population, count)
 *
 * Notes:
 *   - Source: Australian Bureau of Statistics Census data
 *   - This updates suburb_coordinates.population by (name,state) match.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const fileIdx = argv.indexOf("--file");
const filePathArg = fileIdx >= 0 ? argv[fileIdx + 1] : null;
if (!filePathArg) {
  console.error("Usage: node scripts/backfill-population-abs.mjs --file path/to/abs-population.csv");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), filePathArg);
if (!fs.existsSync(filePath)) {
  console.error(`CSV file not found: ${filePath}`);
  process.exit(1);
}

function normaliseName(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function pickColumnIndex(headers, candidates) {
  const h = headers.map((x) => normaliseName(x).replace(/[^a-z0-9]/g, ""));
  for (const c of candidates) {
    const idx = h.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

const raw = fs.readFileSync(filePath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
if (lines.length < 2) {
  console.error("CSV has no data rows.");
  process.exit(1);
}

const headers = parseCsvLine(lines[0]);
const suburbIdx = pickColumnIndex(headers, ["suburb", "locality", "suburblocality", "suburbname"]);
const stateIdx = pickColumnIndex(headers, ["state", "stateabbrev", "stateabbr", "stateabbreviation"]);
const popIdx = pickColumnIndex(headers, ["population", "persons", "totalpopulation", "count"]);

if (suburbIdx < 0 || stateIdx < 0 || popIdx < 0) {
  console.error("Could not detect required columns. Need suburb/locality, state, and population.");
  console.error("Headers found:", headers.join(" | "));
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let matched = 0;
let skipped = 0;
let invalid = 0;

try {
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const suburb = row[suburbIdx];
    const state = row[stateIdx];
    const popRaw = row[popIdx];
    const pop = Number(String(popRaw ?? "").replace(/[^0-9.-]/g, ""));
    if (!suburb || !state || !Number.isFinite(pop) || pop <= 0) {
      invalid++;
      continue;
    }

    const q = await pool.query(
      `UPDATE suburb_coordinates
       SET population = $1
       WHERE lower(trim(name)) = lower(trim($2))
         AND upper(trim(state)) = upper(trim($3))`,
      [Math.round(pop), suburb, state]
    );
    if (q.rowCount > 0) matched += q.rowCount;
    else skipped++;
  }
} finally {
  await pool.end();
}

console.log(`Population backfill complete.
Matched rows: ${matched}
Skipped (no suburb/state match): ${skipped}
Invalid rows: ${invalid}
Source file: ${filePath}`);
