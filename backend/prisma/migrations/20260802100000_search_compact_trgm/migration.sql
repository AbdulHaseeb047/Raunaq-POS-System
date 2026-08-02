-- Faster space-insensitive search: stored compact columns + pg_trgm GIN indexes.
-- Aligns with JS compactText(): strip all whitespace via [[:space:]], then lower.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- customers
ALTER TABLE customers
  ADD COLUMN name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN phone_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX customers_tenant_name_compact_idx
  ON customers (tenant_id, name_compact);
CREATE INDEX customers_name_compact_trgm
  ON customers USING gin (name_compact gin_trgm_ops);
CREATE INDEX customers_phone_compact_trgm
  ON customers USING gin (phone_compact gin_trgm_ops);

-- products
ALTER TABLE products
  ADD COLUMN name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN sku_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(sku, '')), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN barcode_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(barcode, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX products_tenant_name_compact_idx
  ON products (tenant_id, name_compact);
CREATE INDEX products_name_compact_trgm
  ON products USING gin (name_compact gin_trgm_ops);
CREATE INDEX products_sku_compact_trgm
  ON products USING gin (sku_compact gin_trgm_ops);
CREATE INDEX products_barcode_compact_trgm
  ON products USING gin (barcode_compact gin_trgm_ops);

-- categories
ALTER TABLE categories
  ADD COLUMN name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX categories_tenant_name_compact_idx
  ON categories (tenant_id, name_compact);
CREATE INDEX categories_name_compact_trgm
  ON categories USING gin (name_compact gin_trgm_ops);

-- brands
ALTER TABLE brands
  ADD COLUMN name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX brands_tenant_name_compact_idx
  ON brands (tenant_id, name_compact);
CREATE INDEX brands_name_compact_trgm
  ON brands USING gin (name_compact gin_trgm_ops);

-- suppliers
ALTER TABLE suppliers
  ADD COLUMN name_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(name), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN phone_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(phone, '')), '[[:space:]]+', '', 'g')) STORED,
  ADD COLUMN email_compact text
    GENERATED ALWAYS AS (regexp_replace(lower(COALESCE(email, '')), '[[:space:]]+', '', 'g')) STORED;

CREATE INDEX suppliers_tenant_name_compact_idx
  ON suppliers (tenant_id, name_compact);
CREATE INDEX suppliers_name_compact_trgm
  ON suppliers USING gin (name_compact gin_trgm_ops);
CREATE INDEX suppliers_phone_compact_trgm
  ON suppliers USING gin (phone_compact gin_trgm_ops);
CREATE INDEX suppliers_email_compact_trgm
  ON suppliers USING gin (email_compact gin_trgm_ops);
