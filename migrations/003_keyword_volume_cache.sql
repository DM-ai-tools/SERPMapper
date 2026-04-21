CREATE TABLE IF NOT EXISTS keyword_volume_cache (
  keyword TEXT PRIMARY KEY,
  monthly_volume INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kvc_expires
  ON keyword_volume_cache(expires_at);
