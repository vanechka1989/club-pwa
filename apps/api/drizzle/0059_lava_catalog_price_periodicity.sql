UPDATE "payment_provider_catalog_item_prices"
SET "periodicity" = 'ONE_TIME'
WHERE "periodicity" IS NULL;
--> statement-breakpoint
ALTER TABLE "payment_provider_catalog_item_prices"
ALTER COLUMN "periodicity" SET DEFAULT 'ONE_TIME';
--> statement-breakpoint
ALTER TABLE "payment_provider_catalog_item_prices"
ALTER COLUMN "periodicity" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "payment_provider_catalog_item_prices_catalog_item_currency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_catalog_item_prices_catalog_item_currency_periodicity_idx"
ON "payment_provider_catalog_item_prices" USING btree ("catalog_item_id", "currency", "periodicity");
