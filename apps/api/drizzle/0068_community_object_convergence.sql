CREATE TABLE "community_object_lifecycles" (
  "object_key" text NOT NULL,
  "target" varchar(16) NOT NULL,
  "generation" integer NOT NULL DEFAULT 1,
  "state" varchar(16) NOT NULL DEFAULT 'publishing',
  "publication_token" uuid,
  "tombstoned_at" timestamptz,
  "absence_count" integer NOT NULL DEFAULT 0,
  "absent_since" timestamptz,
  "verified_at" timestamptz,
  "next_reconcile_at" timestamptz NOT NULL DEFAULT now(),
  "claim_id" uuid,
  "claimed_at" timestamptz,
  "last_error" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("object_key", "target"),
  CONSTRAINT "community_object_lifecycles_target_check" CHECK ("target" IN ('primary','reserve')),
  CONSTRAINT "community_object_lifecycles_state_check" CHECK ("state" IN ('publishing','present','deleted')),
  CONSTRAINT "community_object_lifecycles_absence_check" CHECK ("absence_count" >= 0)
);--> statement-breakpoint
CREATE INDEX "community_object_lifecycles_reconcile_idx"
  ON "community_object_lifecycles" ("state", "next_reconcile_at", "claimed_at");--> statement-breakpoint
INSERT INTO "community_object_lifecycles" (
  "object_key", "target", "generation", "state", "publication_token", "next_reconcile_at", "updated_at"
)
SELECT publication."object_key", 'primary', 1, 'publishing', publication."publication_token",
       clock_timestamp(), clock_timestamp()
FROM "community_object_publications" publication
ON CONFLICT ("object_key", "target") DO NOTHING;--> statement-breakpoint
INSERT INTO "community_object_lifecycles" (
  "object_key", "target", "generation", "state", "publication_token", "tombstoned_at",
  "absence_count", "next_reconcile_at", "updated_at"
)
SELECT DISTINCT entry."object_key", 'primary', 1, 'deleted', null::uuid, clock_timestamp(),
       0, clock_timestamp(), clock_timestamp()
FROM "community_object_deletion_entries" entry
ON CONFLICT ("object_key", "target") DO UPDATE
SET "generation" = "community_object_lifecycles"."generation" + 1,
    "state" = 'deleted', "publication_token" = null,
    "tombstoned_at" = coalesce("community_object_lifecycles"."tombstoned_at", clock_timestamp()),
    "absence_count" = 0, "absent_since" = null, "verified_at" = null,
    "next_reconcile_at" = clock_timestamp(), "claim_id" = null, "claimed_at" = null,
    "last_error" = null, "updated_at" = clock_timestamp();--> statement-breakpoint
WITH terminal_manifest_keys AS (
  SELECT DISTINCT object_key
  FROM "community_upload_manifests" manifest
  CROSS JOIN LATERAL (VALUES
    (manifest."staging_object_key"),
    (manifest."quarantine_object_key"),
    (manifest."final_object_key")
  ) object_keys(object_key)
  WHERE object_keys.object_key IS NOT NULL
    AND (
      manifest."terminal_cleanup_at" IS NOT NULL
      OR manifest."status" IN ('aborted','cleanup_pending','rejected')
      OR manifest."status" = 'aborting'
    )
), terminal_candidate_keys AS (
  SELECT DISTINCT object_key
  FROM "community_media_candidates" candidate
  CROSS JOIN LATERAL (VALUES
    (candidate."candidate_object_key"),
    (candidate."final_object_key")
  ) object_keys(object_key)
  WHERE object_keys.object_key IS NOT NULL
    AND (
      candidate."terminal_cleanup_at" IS NOT NULL
      OR candidate."status" IN ('cleanup_pending','cleaned')
      OR EXISTS (
        SELECT 1
        FROM "community_upload_manifests" parent_manifest
        WHERE parent_manifest."id" = candidate."manifest_id"
          AND (
            parent_manifest."terminal_cleanup_at" IS NOT NULL
            OR parent_manifest."status" IN ('aborted','aborting','cleanup_pending','rejected')
          )
      )
    )
), published_candidate_keys AS (
  SELECT DISTINCT candidate."candidate_object_key" AS object_key
  FROM "community_media_candidates" candidate
  WHERE candidate."candidate_object_key" IS NOT NULL
    AND candidate."terminal_cleanup_at" IS NULL
    AND candidate."status" IN ('published_cleanup_pending','published')
), quiescing_publication_keys AS (
  SELECT DISTINCT publication."object_key" AS object_key
  FROM "community_object_publications" publication
  WHERE publication."state" = 'quiescing'
), terminal_object_keys AS (
  SELECT object_key FROM terminal_manifest_keys
  UNION
  SELECT object_key FROM terminal_candidate_keys
  UNION
  SELECT object_key FROM published_candidate_keys
  UNION
  SELECT object_key FROM quiescing_publication_keys
)
INSERT INTO "community_object_lifecycles" (
  "object_key", "target", "generation", "state", "publication_token", "tombstoned_at",
  "absence_count", "next_reconcile_at", "updated_at"
)
SELECT terminal."object_key", 'primary', 1, 'deleted', null::uuid, clock_timestamp(),
       0, clock_timestamp(), clock_timestamp()
FROM terminal_object_keys terminal
ON CONFLICT ("object_key", "target") DO UPDATE
SET "generation" = CASE
      WHEN "community_object_lifecycles"."state" = 'deleted'
        THEN "community_object_lifecycles"."generation"
      ELSE "community_object_lifecycles"."generation" + 1
    END,
    "state" = 'deleted', "publication_token" = null,
    "tombstoned_at" = coalesce("community_object_lifecycles"."tombstoned_at", clock_timestamp()),
    "absence_count" = 0, "absent_since" = null, "verified_at" = null,
    "next_reconcile_at" = clock_timestamp(), "claim_id" = null, "claimed_at" = null,
    "last_error" = null, "updated_at" = clock_timestamp();--> statement-breakpoint
DELETE FROM "community_object_publications" publication
USING "community_object_lifecycles" lifecycle
WHERE publication."object_key" = lifecycle."object_key"
  AND lifecycle."state" = 'deleted';
