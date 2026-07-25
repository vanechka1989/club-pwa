CREATE INDEX IF NOT EXISTS "subscriptions_status_expires_at_idx"
  ON "subscriptions" USING btree ("status", "expires_at");
--> statement-breakpoint
CREATE TABLE "membership_expiry_reminder_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "stage" varchar(24) NOT NULL,
  "channel" varchar(16) NOT NULL,
  "status" varchar(16) DEFAULT 'processing' NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_expiry_reminder_deliveries"
  ADD CONSTRAINT "membership_expiry_reminder_deliveries_subscription_id_subscriptions_id_fk"
  FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_expiry_reminder_deliveries"
  ADD CONSTRAINT "membership_expiry_reminder_deliveries_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "membership_expiry_reminders_subscription_expiry_stage_channel_idx"
  ON "membership_expiry_reminder_deliveries" USING btree ("subscription_id", "expires_at", "stage", "channel");
--> statement-breakpoint
CREATE INDEX "membership_expiry_reminders_status_retry_idx"
  ON "membership_expiry_reminder_deliveries" USING btree ("status", "next_attempt_at", "updated_at");
--> statement-breakpoint
CREATE INDEX "membership_expiry_reminders_user_idx"
  ON "membership_expiry_reminder_deliveries" USING btree ("user_id", "created_at");
