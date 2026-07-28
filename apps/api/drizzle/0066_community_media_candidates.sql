ALTER TABLE "community_upload_manifests" DROP CONSTRAINT "community_upload_manifests_status_check";--> statement-breakpoint
ALTER TABLE "community_upload_manifests" ADD CONSTRAINT "community_upload_manifests_status_check" CHECK ("status" IN ('uploading','completing','processing','normalizing','publishing','pending','scanning','ready','failed','cleanup_pending','rejected','aborting','aborted'));--> statement-breakpoint
CREATE TABLE "community_media_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manifest_id" uuid NOT NULL,
  "lease_token" uuid NOT NULL,
  "lease_updated_at" timestamptz NOT NULL,
  "candidate_object_key" text NOT NULL,
  "final_object_key" text NOT NULL,
  "result" jsonb NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'staged',
  "error_code" varchar(160),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_media_candidates_status_check" CHECK ("status" IN ('staged','publishing','cleanup_pending','published_cleanup_pending','published','cleaned'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_media_candidates_manifest_lease_idx" ON "community_media_candidates" ("manifest_id", "lease_token");--> statement-breakpoint
CREATE UNIQUE INDEX "community_media_candidates_candidate_key_idx" ON "community_media_candidates" ("candidate_object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "community_media_candidates_final_key_idx" ON "community_media_candidates" ("final_object_key");--> statement-breakpoint
CREATE INDEX "community_media_candidates_status_updated_idx" ON "community_media_candidates" ("status", "updated_at");
