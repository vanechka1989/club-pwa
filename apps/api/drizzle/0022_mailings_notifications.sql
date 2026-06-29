CREATE TABLE IF NOT EXISTS "app_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" varchar(32) DEFAULT 'system' NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "body_html" text,
  "source" varchar(64),
  "source_id" uuid,
  "attachment_kind" varchar(16),
  "attachment_file_name" varchar(255),
  "attachment_object_key" text,
  "attachment_content_type" varchar(160),
  "attachment_size_bytes" integer,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_mailings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "body_html" text,
  "channel" varchar(16) NOT NULL,
  "filters" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "attachment_kind" varchar(16),
  "attachment_file_name" varchar(255),
  "attachment_object_key" text,
  "attachment_content_type" varchar(160),
  "attachment_size_bytes" integer,
  "telegram_file_id" text,
  "estimated_seconds" integer DEFAULT 0 NOT NULL,
  "target_count" integer DEFAULT 0 NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_mailing_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mailing_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_mailings" ADD CONSTRAINT "admin_mailings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_mailing_recipients" ADD CONSTRAINT "admin_mailing_recipients_mailing_id_admin_mailings_id_fk" FOREIGN KEY ("mailing_id") REFERENCES "public"."admin_mailings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_mailing_recipients" ADD CONSTRAINT "admin_mailing_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_notifications_user_read_created_idx" ON "app_notifications" USING btree ("user_id","read_at","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_notifications_source_idx" ON "app_notifications" USING btree ("source","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_mailings_status_scheduled_idx" ON "admin_mailings" USING btree ("status","scheduled_at","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_mailings_created_idx" ON "admin_mailings" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_mailing_recipients_mailing_status_idx" ON "admin_mailing_recipients" USING btree ("mailing_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_mailing_recipients_user_idx" ON "admin_mailing_recipients" USING btree ("user_id");
