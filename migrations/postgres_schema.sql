-- ============================================================
-- SERPMapper — Local PostgreSQL Schema
-- Run this against your local PostgreSQL database:
--   psql -U postgres -d serpmapper -f migrations/postgres_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- suburb_coordinates
-- ============================================================
CREATE TABLE IF NOT EXISTS suburb_coordinates (
  suburb_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  state                 TEXT NOT NULL,
  postcode              TEXT NOT NULL,
  lat                   DECIMAL(9,6) NOT NULL,
  lng                   DECIMAL(9,6) NOT NULL,
  population            INTEGER,
  dataforseo_location_name TEXT,
  geojson_polygon       JSONB,
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
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, state)
);

CREATE INDEX IF NOT EXISTS idx_suburb_lat_lng ON suburb_coordinates (lat, lng);
CREATE INDEX IF NOT EXISTS idx_suburb_state   ON suburb_coordinates (state);
CREATE INDEX IF NOT EXISTS idx_suburb_name    ON suburb_coordinates (name);

-- ============================================================
-- serpmap_reports
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
  visibility_score  INTEGER,
  summary_text      TEXT,
  cta_copy          TEXT,
  suburbs_checked   INTEGER DEFAULT 0,
  suburbs_total     INTEGER DEFAULT 0,
  cached_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  cache_key         TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_reports_status    ON serpmap_reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_cache_key ON serpmap_reports (cache_key);
CREATE INDEX IF NOT EXISTS idx_reports_created   ON serpmap_reports (created_at DESC);

-- ============================================================
-- serpmap_results
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_results (
  result_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id             UUID NOT NULL REFERENCES serpmap_reports(report_id) ON DELETE CASCADE,
  suburb_id             UUID REFERENCES suburb_coordinates(suburb_id),
  suburb_name           TEXT NOT NULL,
  suburb_state          TEXT,
  rank_position         INTEGER,
  is_in_local_pack      BOOLEAN DEFAULT FALSE,
  monthly_volume        INTEGER DEFAULT 0,
  dataforseo_task_id    TEXT,
  dataforseo_status     TEXT DEFAULT 'pending',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_report_id ON serpmap_results (report_id);
CREATE INDEX IF NOT EXISTS idx_results_task_id   ON serpmap_results (dataforseo_task_id);

-- ============================================================
-- serpmap_leads
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
  product_trial_started     BOOLEAN DEFAULT FALSE,
  product_trial_started_at  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, report_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_email     ON serpmap_leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_report_id ON serpmap_leads (report_id);

-- ============================================================
-- serpmap_cache_index
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
-- ============================================================
CREATE TABLE IF NOT EXISTS serpmap_quota (
  quota_date     DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  reports_count  INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  daily_limit    INTEGER DEFAULT 200,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- opportunity_cards
-- ============================================================
CREATE TABLE IF NOT EXISTS opportunity_cards (
  card_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id      UUID NOT NULL REFERENCES serpmap_reports(report_id) ON DELETE CASCADE,
  suburb_name    TEXT NOT NULL,
  rank_position  INTEGER,
  monthly_volume INTEGER,
  card_text      TEXT NOT NULL,
  display_order  INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_report_id ON opportunity_cards (report_id);
