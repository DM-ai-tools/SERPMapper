-- Add OTP verification columns to serpmap_leads
-- Run: psql -U postgres -d serpmapper -f migrations/add_otp_columns.sql

ALTER TABLE serpmap_leads
  ADD COLUMN IF NOT EXISTS otp_code        TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN DEFAULT FALSE;
