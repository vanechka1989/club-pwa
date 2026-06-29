ALTER TABLE "users" ADD COLUMN "telegram_bot_status" varchar(16) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_bot_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_bot_unblocked_at" timestamp with time zone;
