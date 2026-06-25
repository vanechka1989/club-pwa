CREATE TYPE "public"."payment_product_kind" AS ENUM('one_time', 'recurrent');--> statement-breakpoint
CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recurrent_subscription_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"title" varchar(120) NOT NULL,
	"form_url" text NOT NULL,
	"secret_key" text NOT NULL,
	"sys" varchar(96) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"kind" "payment_product_kind" NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"amount_rub" integer NOT NULL,
	"access_days" integer NOT NULL,
	"prodamus_subscription_id" varchar(64),
	"is_published" boolean DEFAULT false NOT NULL,
	"archived_until" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"amount_rub" integer NOT NULL,
	"provider_order_id" varchar(128) NOT NULL,
	"provider_payment_id" varchar(128),
	"paid_at" timestamp with time zone,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_recurrent_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "recurrent_subscription_status" DEFAULT 'active' NOT NULL,
	"prodamus_subscription_id" varchar(64) NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid,
	"provider" varchar(32) NOT NULL,
	"event_key" varchar(180) NOT NULL,
	"is_valid" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_products" ADD CONSTRAINT "payment_products_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_product_id_payment_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."payment_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD CONSTRAINT "user_recurrent_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD CONSTRAINT "user_recurrent_subscriptions_product_id_payment_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."payment_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recurrent_subscriptions" ADD CONSTRAINT "user_recurrent_subscriptions_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_providers_provider_idx" ON "payment_providers" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "payment_products_provider_kind_idx" ON "payment_products" USING btree ("provider_id","kind","is_published");--> statement-breakpoint
CREATE INDEX "payment_products_archived_idx" ON "payment_products" USING btree ("archived_until");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_provider_order_idx" ON "payment_orders" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "payment_orders_user_status_idx" ON "payment_orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_recurrent_subscriptions_user_product_idx" ON "user_recurrent_subscriptions" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "user_recurrent_subscriptions_user_status_idx" ON "user_recurrent_subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_event_key_idx" ON "payment_webhook_events" USING btree ("provider","event_key");
