ALTER TABLE "payment_provider_catalog_items"
  ADD COLUMN IF NOT EXISTS "is_selectable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_provider_catalog_items_provider_selectable_idx"
  ON "payment_provider_catalog_items" USING btree ("provider_id", "is_selectable", "is_stale");
