-- ============================================================
-- SERPMapper Initial Schema
-- Run this in your Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- suburb_coordinates
-- AU suburb master dataset — loaded once, read-only at runtime.
-- Populated from ABS ASGS suburb GeoJSON + DataforSEO location names.
-- ============================================================
CREATE TABLE IF NOT EXISTS suburb_coordinates (
  suburb_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  state                 TEXT NOT NULL,  -- VIC, NSW, QLD, WA, SA, TAS, ACT, NT
  postcode              TEXT NOT NULL,
  lat                   DECIMAL(9,6) NOT NULL,
  lng                   DECIMAL(9,6) NOT NULL,
  population            INTEGER,
  dataforseo_location_name TEXT,        -- e.g. "Footscray,Victoria,Australia"
  geojson_polygon       JSONB,          -- Simplified ABS GeoJSON polygon
  -- Pre-fetched search volumes for top 20 AU trade keywords
  search_volume_plumber     INTEGER DEFAULT 0,
  search_volume_electrician INTEGER DEFAULT 0,
  search_volume_dentist     INTEGER DEFAULT 0,
  search_volume_cleaner     INTEGER DEFAULT 0,
  search_volume_mechanic    INTEGER DEFAULT 0,
  search_volume_painter     INTEGER DEFAULT 0,
  search_volume_plaster     INTEGER DEFAULT 0,
  search_volume_locksmith   INTEGER DEFAULT 0,
  search_volume_roofer      INTEGER DEFAULT 0,
  search_volume_landscaper  INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for radius queries
CREATE INDEX IF NOT EXISTS idx_suburb_lat_lng ON suburb_coordinates (lat, lng);
CREATE INDEX IF NOT EXISTS idx_suburb_state   ON suburb_coordinates (state);
CREATE INDEX IF NOT EXISTS idx_suburb_name    ON suburb_coordinates (name);

-- ============================================================
-- serpmap_reports
-- One record per unique report request.
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_reports (
  report_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_url      TEXT NOT NULL,
  business_name     TEXT,
  keyword           TEXT NOT NULL,
  city              TEXT NOT NULL,
  business_lat      DECIMAL(9,6),
  business_lng      DECIMAL(9,6),
  business_address  TEXT,
  radius_km         INTEGER NOT NULL DEFAULT 30,
  status            TEXT NOT NULL DEFAULT 'pending',
    -- pending | processing | partial | completed | failed
  visibility_score  INTEGER,           -- 0-100
  summary_text      TEXT,              -- Claude-generated plain-English summary
  cta_copy          TEXT,              -- Claude-generated personalised CTA
  suburbs_checked   INTEGER DEFAULT 0,
  suburbs_total     INTEGER DEFAULT 0,
  cached_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  -- Normalised cache key: sha256(lower(stripped_url) + '|' + lower(keyword) + '|' + radius)
  cache_key         TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_reports_status     ON serpmap_reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_cache_key  ON serpmap_reports (cache_key);
CREATE INDEX IF NOT EXISTS idx_reports_created    ON serpmap_reports (created_at DESC);

-- ============================================================
-- serpmap_results
-- One record per suburb per report (~50 rows per report).
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_results (
  result_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id             UUID NOT NULL REFERENCES serpmap_reports(report_id) ON DELETE CASCADE,
  suburb_id             UUID REFERENCES suburb_coordinates(suburb_id),
  suburb_name           TEXT NOT NULL,
  suburb_state          TEXT,
  rank_position         INTEGER,       -- NULL = not ranking in top 20
  is_in_local_pack      BOOLEAN DEFAULT FALSE,
  monthly_volume        INTEGER DEFAULT 0,
  dataforseo_task_id    TEXT,
  dataforseo_status     TEXT DEFAULT 'pending',
    -- pending | processing | completed | error
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_report_id  ON serpmap_results (report_id);
CREATE INDEX IF NOT EXISTS idx_results_task_id    ON serpmap_results (dataforseo_task_id);

-- ============================================================
-- serpmap_leads
-- Email captures — one record per email submission.
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_leads (
  lead_id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                     TEXT NOT NULL,
  report_id                 UUID REFERENCES serpmap_reports(report_id),
  business_name             TEXT,
  business_url              TEXT,
  primary_keyword           TEXT,
  top_missed_suburb         TEXT,
  utm_source                TEXT,
  utm_medium                TEXT,
  utm_campaign              TEXT,
  sendgrid_sequence_started BOOLEAN DEFAULT FALSE,
  -- product_trial_started: set to TRUE via /api/webhooks/conversion when this
  -- lead converts to a paying customer of any future DotMappers product.
  -- Null until any product launches — not a dependency on any specific product.
  product_trial_started     BOOLEAN DEFAULT FALSE,
  product_trial_started_at  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_email     ON serpmap_leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_report_id ON serpmap_leads (report_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_report ON serpmap_leads (email, report_id);

-- ============================================================
-- serpmap_cache_index
-- Quick lookup to prevent re-calling DataforSEO within 7 days.
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_cache_index (
  cache_key   TEXT PRIMARY KEY,
  report_id   UUID NOT NULL REFERENCES serpmap_reports(report_id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON serpmap_cache_index (expires_at);

-- ============================================================
-- serpmap_quota
-- Daily DataforSEO API call budget tracking.
-- One row per UTC calendar day, upserted on each report.
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_quota (
  quota_date     DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  reports_count  INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  daily_limit    INTEGER DEFAULT 200,   -- configurable
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- opportunity_cards
-- Claude-generated per-suburb opportunity narratives.
-- Stored separately for efficient retrieval in report view.
-- ============================================================
CREATE TABLE IF NOT EXISTS opportunity_cards (
  card_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id     UUID NOT NULL REFERENCES serpmap_reports(report_id) ON DELETE CASCADE,
  suburb_name   TEXT NOT NULL,
  rank_position INTEGER,
  monthly_volume INTEGER,
  card_text     TEXT NOT NULL,          -- Claude-generated 1-sentence opportunity
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_report_id ON opportunity_cards (report_id);

-- ============================================================
-- Supabase Realtime — enable on results table so the frontend
-- can subscribe to live polygon updates as suburbs resolve.
-- ============================================================
ALTER TABLE serpmap_results REPLICA IDENTITY FULL;
ALTER TABLE serpmap_reports REPLICA IDENTITY FULL;

-- Add tables to the realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'serpmap_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE serpmap_results;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'serpmap_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE serpmap_reports;
  END IF;
END $$;

-- ============================================================
-- Row Level Security
-- Public can read reports/results by report_id (for shared URLs).
-- Leads are private (service role only).
-- ============================================================
ALTER TABLE serpmap_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE serpmap_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE serpmap_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suburb_coordinates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_cards     ENABLE ROW LEVEL SECURITY;

-- Anyone can read a report by UUID (shared report URLs)
CREATE POLICY "reports_public_read" ON serpmap_reports
  FOR SELECT USING (true);

CREATE POLICY "results_public_read" ON serpmap_results
  FOR SELECT USING (true);

CREATE POLICY "cards_public_read" ON opportunity_cards
  FOR SELECT USING (true);

-- Suburb data is public read
CREATE POLICY "suburbs_public_read" ON suburb_coordinates
  FOR SELECT USING (true);

-- Leads: service role only (no public access)
CREATE POLICY "leads_service_only" ON serpmap_leads
  FOR ALL USING (auth.role() = 'service_role');

-- All writes go through API routes using service role key
CREATE POLICY "reports_service_insert" ON serpmap_reports
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "reports_service_update" ON serpmap_reports
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "results_service_insert" ON serpmap_results
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "results_service_update" ON serpmap_results
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "cards_service_insert" ON opportunity_cards
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
