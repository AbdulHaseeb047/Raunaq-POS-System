-- Optional search acceleration: compact columns + pg_trgm GIN indexes.
-- App search/uniqueness use regexp_replace expressions and do not require this migration.
-- Extension/index creation is best-effort so managed Postgres without pg_trgm still migrates.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm skipped (insufficient privilege)';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm skipped: %', SQLERRM;
END $$;

-- customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS phone_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS customers_tenant_name_compact_idx
  ON customers (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS customers_name_compact_trgm ON customers USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS customers_phone_compact_trgm ON customers USING gin (phone_compact gin_trgm_ops)';
  END IF;
END $$;

-- products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS sku_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(sku, '')), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS barcode_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(barcode, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS products_tenant_name_compact_idx
  ON products (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_name_compact_trgm ON products USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_sku_compact_trgm ON products USING gin (sku_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_barcode_compact_trgm ON products USING gin (barcode_compact gin_trgm_ops)';
  END IF;
END $$;

-- categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS categories_tenant_name_compact_idx
  ON categories (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS categories_name_compact_trgm ON categories USING gin (name_compact gin_trgm_ops)';
  END IF;
END $$;

-- brands
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS brands_tenant_name_compact_idx
  ON brands (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brands_name_compact_trgm ON brands USING gin (name_compact gin_trgm_ops)';
  END IF;
END $$;

-- suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS phone_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS email_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(email, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS suppliers_tenant_name_compact_idx
  ON suppliers (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_name_compact_trgm ON suppliers USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_phone_compact_trgm ON suppliers USING gin (phone_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_email_compact_trgm ON suppliers USING gin (email_compact gin_trgm_ops)';
  END IF;
END $$;
