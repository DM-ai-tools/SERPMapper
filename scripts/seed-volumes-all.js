/**
 * Seed realistic search volumes for all suburbs that have 0 volumes.
 * Volumes scale with population density — CBD > inner > outer > regional.
 * Run: node scripts/seed-volumes-all.js
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KEYWORDS = ['plumber','electrician','dentist','cleaner','mechanic','painter','plaster','locksmith','roofer','landscaper'];

// CBD/major centres get higher volumes
const HIGH_VOLUME = new Set([
  'Melbourne','Sydney','Brisbane','Perth','Adelaide','Canberra','Darwin','Hobart',
  'Gold Coast','Surfers Paradise','Parramatta','Newcastle','Wollongong','Geelong',
  'Townsville','Cairns','Toowoomba','Fremantle','Launceston','Ballarat','Bendigo',
]);
const MID_VOLUME = new Set([
  'Chatswood','Bondi','Manly','Newtown','Hawthorn','Richmond','Carlton','Fitzroy',
  'Collingwood','St Kilda','Southbank','South Melbourne','Port Melbourne','Subiaco',
  'Norwood','Glenelg','Newnham','Sandy Bay','Glenorchy','South Brisbane',
  'Fortitude Valley','Toowong','Indooroopilly','Broadbeach','Robina','Southport',
]);

function volume(name, keyword) {
  const base = HIGH_VOLUME.has(name) ? 300 :
               MID_VOLUME.has(name)  ? 180 : 90;
  const variance = Math.floor(Math.random() * base * 0.4);
  const keywordMult = ['plumber','electrician','dentist'].includes(keyword) ? 1.2 : 1.0;
  return Math.round((base + variance - base * 0.2) * keywordMult);
}

async function main() {
  // Only update suburbs that have ALL zero volumes
  const rows = await pool.query(`
    SELECT suburb_id, name FROM suburb_coordinates
    WHERE search_volume_plumber = 0
      AND search_volume_electrician = 0
      AND search_volume_dentist = 0
  `);
  console.log(`Seeding volumes for ${rows.rows.length} suburbs...`);

  let done = 0;
  for (const r of rows.rows) {
    const vals = {};
    for (const kw of KEYWORDS) vals[kw] = volume(r.name, kw);
    await pool.query(
      `UPDATE suburb_coordinates SET
        search_volume_plumber     = $1,
        search_volume_electrician = $2,
        search_volume_dentist     = $3,
        search_volume_cleaner     = $4,
        search_volume_mechanic    = $5,
        search_volume_painter     = $6,
        search_volume_plaster     = $7,
        search_volume_locksmith   = $8,
        search_volume_roofer      = $9,
        search_volume_landscaper  = $10
       WHERE suburb_id = $11`,
      [vals.plumber, vals.electrician, vals.dentist, vals.cleaner, vals.mechanic,
       vals.painter, vals.plaster, vals.locksmith, vals.roofer, vals.landscaper,
       r.suburb_id]
    );
    done++;
  }
  console.log(`Done! Updated ${done} suburbs with search volumes.`);
}

main().catch(console.error).finally(() => pool.end());
