ALTER TABLE "users" ADD COLUMN "marketing_email_opt_out_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "admin_mailings" ADD COLUMN "delivery_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "channel" varchar(16) DEFAULT 'push' NOT NULL;
--> statement-breakpoint
UPDATE "admin_mailings" SET "channel" = 'push' WHERE "channel" IN ('app', 'bot', 'all');
--> statement-breakpoint
UPDATE "admin_mailings" SET "delivery_count" = "target_count" WHERE "delivery_count" = 0;
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mailing_recipients_mailing_user_channel_idx" ON "admin_mailing_recipients" USING btree ("mailing_id", "user_id", "channel");
