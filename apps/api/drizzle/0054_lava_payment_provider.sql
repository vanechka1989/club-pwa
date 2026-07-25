ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "api_key" text;
--> statement-breakpoint
ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "webhook_secret" text;
--> statement-breakpoint
ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "last_check_error" text;
--> statement-breakpoint
ALTER TABLE "payment_providers" ADD COLUMN IF NOT EXISTS "last_catalog_sync_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payment_providers" ALTER COLUMN "form_url" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_providers" ALTER COLUMN "secret_key" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_providers" ALTER COLUMN "sys" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_product_provider_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "payment_products"("id") ON DELETE CASCADE,
  "provider_id" uuid NOT NULL REFERENCES "payment_providers"("id") ON DELETE CASCADE,
  "external_product_id" varchar(160),
  "external_offer_id" varchar(160),
  "is_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_product_provider_bindings_product_provider_idx"
  ON "payment_product_provider_bindings" USING btree ("product_id", "provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_product_provider_bindings_provider_enabled_idx"
  ON "payment_product_provider_bindings" USING btree ("provider_id", "is_enabled");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_provider_catalog_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_id" uuid NOT NULL REFERENCES "payment_providers"("id") ON DELETE CASCADE,
  "external_product_id" varchar(160) NOT NULL,
  "external_offer_id" varchar(160) DEFAULT '' NOT NULL,
  "title" varchar(240) NOT NULL,
  "kind" "payment_product_kind" NOT NULL,
  "amount_rub" integer,
  "is_stale" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_catalog_items_provider_external_idx"
  ON "payment_provider_catalog_items" USING btree ("provider_id", "external_product_id", "external_offer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_provider_catalog_items_provider_stale_idx"
  ON "payment_provider_catalog_items" USING btree ("provider_id", "is_stale");
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "external_order_id" varchar(160);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "external_subscription_id" varchar(160);
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD COLUMN IF NOT EXISTS "external_subscription_id" varchar(160);
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ALTER COLUMN "prodamus_subscription_id" DROP NOT NULL;
--> statement-breakpoint
INSERT INTO "payment_product_provider_bindings"
  ("product_id", "provider_id", "external_product_id", "is_enabled")
SELECT
  product."id",
  product."provider_id",
  product."prodamus_subscription_id",
  true
FROM "payment_products" product
JOIN "payment_providers" provider ON provider."id" = product."provider_id"
WHERE provider."provider" = 'prodamus'
ON CONFLICT ("product_id", "provider_id") DO NOTHING;
--> statement-breakpoint
UPDATE "user_recurrent_subscriptions"
SET "external_subscription_id" = "prodamus_subscription_id"
WHERE "external_subscription_id" IS NULL;
