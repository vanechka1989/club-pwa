CREATE TYPE "payment_currency" AS ENUM ('RUB', 'USD', 'EUR');
--> statement-breakpoint
ALTER TABLE "payment_products" ALTER COLUMN "amount_rub" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "currency" "payment_currency";
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "amount_minor" integer;
--> statement-breakpoint
UPDATE "payment_orders"
SET "currency" = 'RUB', "amount_minor" = "amount_rub" * 100;
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "currency" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "amount_minor" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "amount_rub" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_amount_minor_positive" CHECK ("amount_minor" > 0);
--> statement-breakpoint
CREATE TABLE "payment_provider_catalog_item_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "catalog_item_id" uuid NOT NULL REFERENCES "payment_provider_catalog_items"("id") ON DELETE cascade,
  "currency" "payment_currency" NOT NULL,
  "amount_minor" integer,
  "periodicity" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_provider_catalog_item_prices_amount_minor_positive" CHECK ("amount_minor" IS NULL OR "amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_catalog_item_prices_catalog_item_currency_idx"
  ON "payment_provider_catalog_item_prices" USING btree ("catalog_item_id", "currency");
--> statement-breakpoint
CREATE TABLE "payment_product_provider_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "binding_id" uuid NOT NULL REFERENCES "payment_product_provider_bindings"("id") ON DELETE cascade,
  "currency" "payment_currency" NOT NULL,
  "amount_minor" integer NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_product_provider_prices_amount_minor_positive" CHECK ("amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_product_provider_prices_binding_currency_idx"
  ON "payment_product_provider_prices" USING btree ("binding_id", "currency");
--> statement-breakpoint
CREATE INDEX "payment_product_provider_prices_binding_enabled_idx"
  ON "payment_product_provider_prices" USING btree ("binding_id", "is_enabled");
