-- Search indexes (faster product / customer / sale lookup)
CREATE INDEX IF NOT EXISTS "products_tenant_id_name_idx"
  ON "products" ("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "products_tenant_id_barcode_idx"
  ON "products" ("tenant_id", "barcode")
  WHERE "barcode" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "products_tenant_id_sku_idx"
  ON "products" ("tenant_id", "sku")
  WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_tenant_id_name_idx"
  ON "customers" ("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "customers_tenant_id_phone_idx"
  ON "customers" ("tenant_id", "phone")
  WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "sales_tenant_id_sale_number_idx"
  ON "sales" ("tenant_id", "sale_number");

-- ---------------------------------------------------------------------------
-- Row Level Security (defense in depth — app still passes tenantId explicitly)
-- Session vars set by API: app.current_tenant_id, app.bypass_rls
-- Use session/direct DATABASE_URL (not transaction pooler :6543).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), 'false') = 'true';
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'categories',
    'brands',
    'suppliers',
    'supplier_ledger_entries',
    'products',
    'stock_movements',
    'customers',
    'customer_ledger_entries',
    'customer_credit_obligations',
    'customer_payment_allocations',
    'sales',
    'sale_items',
    'sale_payments',
    'held_carts',
    'gift_cards',
    'sale_returns',
    'sale_return_items',
    'discount_rules',
    'discount_usages',
    'business_settings',
    'branches',
    'sale_sequences',
    'sync_outbox',
    'sync_state',
    'sync_changelog',
    'sync_devices',
    'tenant_features',
    'license_activations',
    'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
           USING (app_bypass_rls() OR tenant_id = app_current_tenant_id())
           WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant_id())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Users: tenant rows isolated; platform users (tenant_id IS NULL) visible when bypassing
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_users ON "users";
CREATE POLICY tenant_isolation_users ON "users"
  USING (app_bypass_rls() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant_id());

-- Login / seed / workers must call: SELECT set_config('app.bypass_rls', 'true', false);
