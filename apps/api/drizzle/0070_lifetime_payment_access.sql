CREATE TYPE "payment_access_type" AS ENUM ('limited', 'lifetime');
--> statement-breakpoint
ALTER TABLE "payment_products" ADD COLUMN "access_type" "payment_access_type" DEFAULT 'limited' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_products" ALTER COLUMN "access_days" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_products" ADD CONSTRAINT "payment_products_access_check" CHECK (("access_type" = 'limited' AND "access_days" BETWEEN 1 AND 3650) OR ("access_type" = 'lifetime' AND "kind" = 'one_time' AND "access_days" IS NULL));
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ADD COLUMN "access_type" "payment_access_type" DEFAULT 'limited' NOT NULL;
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ALTER COLUMN "access_days" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" DROP CONSTRAINT "individual_payment_offers_access_days_check";
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ADD CONSTRAINT "individual_payment_offers_access_check" CHECK (("access_type" = 'limited' AND "access_days" BETWEEN 1 AND 3650) OR ("access_type" = 'lifetime' AND "kind" = 'one_time' AND "access_days" IS NULL));
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "access_type_snapshot" "payment_access_type";
--> statement-breakpoint
UPDATE "payment_orders" SET "access_type_snapshot" = 'limited' WHERE "individual_offer_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_product_or_offer_check";
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_product_or_offer_check" CHECK (("product_id" IS NOT NULL AND "individual_offer_id" IS NULL) OR ("product_id" IS NULL AND "individual_offer_id" IS NOT NULL AND "product_title_snapshot" IS NOT NULL AND "product_kind_snapshot" IS NOT NULL AND "access_type_snapshot" IS NOT NULL AND (("access_type_snapshot" = 'limited' AND "access_days_snapshot" IS NOT NULL) OR ("access_type_snapshot" = 'lifetime' AND "access_days_snapshot" IS NULL))));
