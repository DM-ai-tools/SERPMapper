-- Dynamic keyword volumes + resolved Maps query per report
-- Run: psql -U postgres -d serpmapper -f migrations/add_search_volumes_jsonb.sql

ALTER TABLE suburb_coordinates
  ADD COLUMN IF NOT EXISTS search_volumes JSONB DEFAULT '{}'::jsonb;

ALTER TABLE serpmap_reports
  ADD COLUMN IF NOT EXISTS maps_search_query TEXT;

-- One-time backfill: legacy columns → JSON keys (slug = same as seed scripts, e.g. plumber)
UPDATE suburb_coordinates
SET search_volumes = COALESCE(search_volumes, '{}'::jsonb) || jsonb_build_object(
  'plumber', COALESCE(search_volume_plumber, 0),
  'electrician', COALESCE(search_volume_electrician, 0),
  'dentist', COALESCE(search_volume_dentist, 0),
  'cleaner', COALESCE(search_volume_cleaner, 0),
  'mechanic', COALESCE(search_volume_mechanic, 0),
  'painter', COALESCE(search_volume_painter, 0),
  'plaster', COALESCE(search_volume_plaster, 0),
  'locksmith', COALESCE(search_volume_locksmith, 0),
  'roofer', COALESCE(search_volume_roofer, 0),
  'landscaper', COALESCE(search_volume_landscaper, 0)
);
