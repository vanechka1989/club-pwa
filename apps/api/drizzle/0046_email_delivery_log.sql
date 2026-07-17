CREATE TABLE "email_delivery_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category" varchar(32) NOT NULL,
  "recipient_count" integer DEFAULT 1 NOT NULL,
  "status" varchar(16) DEFAULT 'processing' NOT NULL,
  "message_id" text,
  "error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_delivery_log_status_created_idx" ON "email_delivery_log" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "email_delivery_log_created_idx" ON "email_delivery_log" USING btree ("created_at");
