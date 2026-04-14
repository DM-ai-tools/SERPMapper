-- ============================================================
-- Suburb Data Load Script
-- This is a guide — actual data comes from ABS GeoJSON.
-- Run the Node.js seed script: scripts/seed-suburbs.ts
-- ============================================================

-- Verify load after seeding
SELECT
  state,
  COUNT(*) AS suburb_count,
  AVG(population) AS avg_population
FROM suburb_coordinates
GROUP BY state
ORDER BY suburb_count DESC;

-- Verify DataforSEO location names populated
SELECT COUNT(*) AS missing_dataforseo_location
FROM suburb_coordinates
WHERE dataforseo_location_name IS NULL;

-- Sample query: suburbs within 30km of Melbourne CBD (-37.8136, 144.9631)
SELECT
  name, state, postcode, lat, lng,
  ROUND(
    6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(lat - (-37.8136)) / 2), 2) +
      COS(RADIANS(-37.8136)) * COS(RADIANS(lat)) *
      POWER(SIN(RADIANS(lng - 144.9631) / 2), 2)
    ))::numeric,
    1
  ) AS distance_km
FROM suburb_coordinates
WHERE
  -- Bounding box pre-filter for performance
  lat BETWEEN -37.8136 - 0.27 AND -37.8136 + 0.27
  AND lng BETWEEN 144.9631 - 0.36 AND 144.9631 + 0.36
HAVING distance_km <= 30
ORDER BY distance_km
LIMIT 60;
