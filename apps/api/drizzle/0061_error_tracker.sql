CREATE TABLE "error_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "title" varchar(180) NOT NULL,
  "source" varchar(32) NOT NULL,
  "kind" varchar(80) NOT NULL,
  "severity" varchar(16) NOT NULL,
  "status" varchar(20) DEFAULT 'new' NOT NULL,
  "route" text,
  "first_release" varchar(64),
  "latest_release" varchar(64),
  "total_count" integer DEFAULT 1 NOT NULL,
  "affected_users" integer DEFAULT 0 NOT NULL,
  "affected_devices" integer DEFAULT 0 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_notified_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "muted_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "error_groups_fingerprint_idx" ON "error_groups" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "error_groups_status_seen_idx" ON "error_groups" USING btree ("status","last_seen_at");
--> statement-breakpoint
CREATE INDEX "error_groups_severity_seen_idx" ON "error_groups" USING btree ("severity","last_seen_at");
--> statement-breakpoint
CREATE TABLE "error_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "user_id" uuid,
  "installation_id" varchar(64),
  "message" text NOT NULL,
  "stack" text,
  "route" text,
  "method" varchar(16),
  "http_status" integer,
  "release" varchar(64),
  "platform" varchar(120),
  "user_agent" text,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_occurrences" ADD CONSTRAINT "error_occurrences_group_id_error_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."error_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "error_occurrences" ADD CONSTRAINT "error_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "error_occurrences_group_occurred_idx" ON "error_occurrences" USING btree ("group_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "error_occurrences_user_occurred_idx" ON "error_occurrences" USING btree ("user_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "error_occurrences_occurred_idx" ON "error_occurrences" USING btree ("occurred_at");
--> statement-breakpoint
CREATE TABLE "error_notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "channel" varchar(16) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_notification_deliveries" ADD CONSTRAINT "error_notification_deliveries_group_id_error_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."error_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "error_notification_deliveries_group_created_idx" ON "error_notification_deliveries" USING btree ("group_id","created_at");
--> statement-breakpoint
CREATE INDEX "error_notification_deliveries_status_updated_idx" ON "error_notification_deliveries" USING btree ("status","updated_at");
