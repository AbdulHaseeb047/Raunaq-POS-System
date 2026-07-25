-- Hotfix: FORCE RLS + connection pooling broke sales (SET session vars on one
-- connection, $transaction on another → INSERT rejected / empty reads).
-- Keep RLS enabled for non-owner roles; app DB role (table owner) is not forced.
-- Interactive transactions still SET LOCAL via Prisma wrapper for defense in depth.

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
    'audit_log',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
