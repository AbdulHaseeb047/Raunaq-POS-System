ALTER TABLE "products"
  ADD COLUMN "image_url" TEXT;

INSERT INTO "feature_registry" ("key", "module", "label", "description", "is_active")
VALUES (
  'inventory.product_images',
  'inventory',
  'Product Images',
  'Upload product images and show them on the sale register',
  true
)
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "is_active" = true;

INSERT INTO "tier_presets" ("tier", "feature_key")
VALUES
  ('STANDARD', 'inventory.product_images'),
  ('PRO', 'inventory.product_images'),
  ('ENTERPRISE', 'inventory.product_images')
ON CONFLICT ("tier", "feature_key") DO NOTHING;
