/**
 * Generate octagon polygons for ALL suburbs that don't have one yet.
 * Run: node scripts/seed-polygons-all.js
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function octagon(lat, lng, radiusKm = 0.75) {
  const latDeg = radiusKm / 111.0;
  const lngDeg = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const coords = angles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return [
      parseFloat((lng + lngDeg * Math.sin(rad)).toFixed(6)),
      parseFloat((lat + latDeg * Math.cos(rad)).toFixed(6)),
    ];
  });
  coords.push(coords[0]); // close the ring
  return { type: 'Polygon', coordinates: [coords] };
}

async function main() {
  const rows = await pool.query(
    'SELECT suburb_id, lat, lng, name, state FROM suburb_coordinates WHERE geojson_polygon IS NULL'
  );
  console.log(`Adding polygons for ${rows.rows.length} suburbs...`);

  let done = 0;
  for (const r of rows.rows) {
    const poly = octagon(parseFloat(r.lat), parseFloat(r.lng));
    await pool.query(
      'UPDATE suburb_coordinates SET geojson_polygon = $1 WHERE suburb_id = $2',
      [JSON.stringify(poly), r.suburb_id]
    );
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${rows.rows.length}`);
  }
  console.log(`Done! Updated ${done} suburbs with polygon data.`);
}

main().catch(console.error).finally(() => pool.end());
