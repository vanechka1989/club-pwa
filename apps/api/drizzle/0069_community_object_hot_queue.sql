ALTER TABLE "community_object_lifecycles"
  ADD COLUMN "hot_until" timestamptz,
  ADD COLUMN "cold_at" timestamptz;--> statement-breakpoint

UPDATE "community_object_lifecycles"
SET "hot_until" = clock_timestamp(),
    "cold_at" = null,
    "next_reconcile_at" = least("next_reconcile_at", clock_timestamp()),
    "claim_id" = null,
    "claimed_at" = null,
    "updated_at" = clock_timestamp()
WHERE "state" = 'deleted';--> statement-breakpoint

CREATE INDEX "community_object_lifecycles_hot_due_idx"
  ON "community_object_lifecycles" ("next_reconcile_at", "object_key", "target")
  WHERE "state" = 'deleted' AND "cold_at" IS NULL;--> statement-breakpoint

CREATE INDEX "community_object_publications_attachment_stale_idx"
  ON "community_object_publications" ("updated_at", "source_id")
  WHERE "source_type" = 'attachment' AND "state" = 'publishing';
