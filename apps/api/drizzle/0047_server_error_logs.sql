CREATE TABLE "server_error_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(180) NOT NULL,
  "detail" text NOT NULL,
  "path" text,
  "method" varchar(16),
  "status" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_error_logs_created_idx" ON "server_error_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "server_error_logs_status_created_idx" ON "server_error_logs" USING btree ("status", "created_at");
