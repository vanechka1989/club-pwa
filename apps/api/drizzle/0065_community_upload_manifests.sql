CREATE TABLE "community_upload_manifests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "upload_token" uuid NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "upload_type" varchar(16) NOT NULL,
  "staging_object_key" text NOT NULL,
  "quarantine_object_key" text,
  "final_object_key" text,
  "multipart_upload_id" text,
  "expected_part_count" integer,
  "part_size_bytes" integer,
  "file_name" varchar(255) NOT NULL,
  "content_type" varchar(160) NOT NULL,
  "size_bytes" integer NOT NULL,
  "duration_seconds" integer,
  "width" integer,
  "height" integer,
  "result" jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'uploading',
  "error_code" varchar(160),
  "attachment_id" uuid REFERENCES "club_message_attachments"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_upload_manifests_status_check" CHECK ("status" IN ('uploading','completing','processing','normalizing','pending','scanning','ready','failed','cleanup_pending','rejected','aborting','aborted')),
  CONSTRAINT "community_upload_manifests_upload_type_check" CHECK ("upload_type" IN ('put','multipart'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_upload_manifests_token_idx" ON "community_upload_manifests" ("upload_token");--> statement-breakpoint
CREATE UNIQUE INDEX "community_upload_manifests_staging_key_idx" ON "community_upload_manifests" ("staging_object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "community_upload_manifests_final_key_idx" ON "community_upload_manifests" ("final_object_key");--> statement-breakpoint
CREATE INDEX "community_upload_manifests_status_updated_idx" ON "community_upload_manifests" ("status", "updated_at");--> statement-breakpoint
CREATE INDEX "community_upload_manifests_expiry_idx" ON "community_upload_manifests" ("expires_at", "status");
