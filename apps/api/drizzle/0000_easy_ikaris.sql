CREATE TYPE "public"."content_kind" AS ENUM('text', 'photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('inactive', 'active', 'expired');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TABLE "content_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" "content_kind" NOT NULL,
	"title" varchar(180) NOT NULL,
	"summary" text,
	"body" text,
	"media_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'inactive' NOT NULL,
	"provider" varchar(32) DEFAULT 'manual' NOT NULL,
	"provider_payment_id" varchar(128),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" varchar(96) NOT NULL,
	"message" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" varchar(32) NOT NULL,
	"first_name" varchar(128),
	"username" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_categories_slug_idx" ON "content_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_categories_published_sort_idx" ON "content_categories" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "content_items_category_published_idx" ON "content_items" USING btree ("category_id","is_published","sort_order");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_user_status_idx" ON "support_tickets" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_idx" ON "users" USING btree ("telegram_id");