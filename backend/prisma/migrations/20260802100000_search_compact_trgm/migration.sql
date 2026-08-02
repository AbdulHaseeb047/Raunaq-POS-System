-- Optional search acceleration: compact columns + pg_trgm GIN indexes.
-- App auto-detects these columns and falls back to regexp_replace if missing.
-- Safe to re-run; pg_trgm / GIN are best-effort on managed Postgres.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm skipped (insufficient privilege)';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm skipped: %', SQLERRM;
END $$;

-- Helper: add a STORED generated compact column if missing (works on PG 12+).
DO $$
BEGIN
  -- customers.name_compact
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'name_compact'
  ) THEN
    ALTER TABLE customers ADD COLUMN name_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'phone_compact'
  ) THEN
    ALTER TABLE customers ADD COLUMN phone_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED;
  END IF;

  -- products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'name_compact'
  ) THEN
    ALTER TABLE products ADD COLUMN name_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'sku_compact'
  ) THEN
    ALTER TABLE products ADD COLUMN sku_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(sku, '')), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode_compact'
  ) THEN
    ALTER TABLE products ADD COLUMN barcode_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(barcode, '')), '[[:space:]]+', '', 'g')) STORED;
  END IF;

  -- categories / brands / suppliers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'name_compact'
  ) THEN
    ALTER TABLE categories ADD COLUMN name_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'name_compact'
  ) THEN
    ALTER TABLE brands ADD COLUMN name_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'name_compact'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN name_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'phone_compact'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN phone_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'email_compact'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN email_compact text
      GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(email, '')), '[[:space:]]+', '', 'g')) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customers_tenant_name_compact_idx ON customers (tenant_id, name_compact);
CREATE INDEX IF NOT EXISTS products_tenant_name_compact_idx ON products (tenant_id, name_compact);
CREATE INDEX IF NOT EXISTS categories_tenant_name_compact_idx ON categories (tenant_id, name_compact);
CREATE INDEX IF NOT EXISTS brands_tenant_name_compact_idx ON brands (tenant_id, name_compact);
CREATE INDEX IF NOT EXISTS suppliers_tenant_name_compact_idx ON suppliers (tenant_id, name_compact);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS customers_name_compact_trgm ON customers USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS customers_phone_compact_trgm ON customers USING gin (phone_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_name_compact_trgm ON products USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_sku_compact_trgm ON products USING gin (sku_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS products_barcode_compact_trgm ON products USING gin (barcode_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS categories_name_compact_trgm ON categories USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS brands_name_compact_trgm ON brands USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_name_compact_trgm ON suppliers USING gin (name_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_phone_compact_trgm ON suppliers USING gin (phone_compact gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS suppliers_email_compact_trgm ON suppliers USING gin (email_compact gin_trgm_ops)';
  END IF;
END $$;
