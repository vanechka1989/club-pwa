CREATE TABLE "individual_payment_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"kind" "payment_product_kind" NOT NULL,
	"title" varchar(180) NOT NULL,
	"currency" "payment_currency" NOT NULL,
	"amount_minor" integer NOT NULL,
	"access_days" integer NOT NULL,
	"external_product_id" varchar(160),
	"external_offer_id" varchar(160),
	"catalog_snapshot" jsonb,
	"token_hash" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_opened_at" timestamp with time zone,
	"checkout_started_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "individual_payment_offers_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "individual_payment_offers_status_check" CHECK ("status" IN ('active', 'checkout_pending', 'paid', 'expired', 'cancelled')),
	CONSTRAINT "individual_payment_offers_amount_check" CHECK ("amount_minor" > 0),
	CONSTRAINT "individual_payment_offers_access_days_check" CHECK ("access_days" BETWEEN 1 AND 3650)
);
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ADD CONSTRAINT "individual_payment_offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ADD CONSTRAINT "individual_payment_offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "individual_payment_offers" ADD CONSTRAINT "individual_payment_offers_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "product_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "individual_offer_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "product_title_snapshot" varchar(180);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "product_kind_snapshot" "payment_product_kind";
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "access_days_snapshot" integer;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_individual_offer_id_individual_payment_offers_id_fk" FOREIGN KEY ("individual_offer_id") REFERENCES "public"."individual_payment_offers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_product_or_offer_check" CHECK (("product_id" IS NOT NULL AND "individual_offer_id" IS NULL) OR ("product_id" IS NULL AND "individual_offer_id" IS NOT NULL AND "product_title_snapshot" IS NOT NULL AND "product_kind_snapshot" IS NOT NULL AND "access_days_snapshot" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "individual_payment_offers_user_created_idx" ON "individual_payment_offers" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "individual_payment_offers_status_expires_idx" ON "individual_payment_offers" USING btree ("status", "expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_offer_pending_unique" ON "payment_orders" USING btree ("individual_offer_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_offer_paid_unique" ON "payment_orders" USING btree ("individual_offer_id") WHERE "status" = 'paid';
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ALTER COLUMN "product_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD COLUMN "individual_offer_id" uuid;
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD CONSTRAINT "user_recurrent_subscriptions_individual_offer_id_individual_payment_offers_id_fk" FOREIGN KEY ("individual_offer_id") REFERENCES "public"."individual_payment_offers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD CONSTRAINT "user_recurrent_subscriptions_product_or_offer_check" CHECK (("product_id" IS NOT NULL AND "individual_offer_id" IS NULL) OR ("product_id" IS NULL AND "individual_offer_id" IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX "user_recurrent_subscriptions_user_offer_idx" ON "user_recurrent_subscriptions" USING btree ("user_id", "individual_offer_id");
