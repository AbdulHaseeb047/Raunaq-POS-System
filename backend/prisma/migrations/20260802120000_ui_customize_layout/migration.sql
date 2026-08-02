-- Sale Quick pick favorites + Dashboard layout (Standard+ ui.customize)
ALTER TABLE "business_settings"
  ADD COLUMN IF NOT EXISTS "sale_quick_pick_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "dashboard_layout" JSONB;
