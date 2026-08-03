-- Optional on-screen receipt after checkout (independent of auto-print).
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS show_receipt_after_sale BOOLEAN NOT NULL DEFAULT true;
