ALTER TABLE "users" ADD COLUMN "community_access_version" integer NOT NULL DEFAULT 1;--> statement-breakpoint

ALTER TABLE "club_chat_messages" ADD COLUMN "lifecycle_version" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "terminal_cleanup_at" timestamptz;--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "lifecycle_version" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "terminal_cleanup_at" timestamptz;--> statement-breakpoint
ALTER TABLE "community_upload_manifests" ADD COLUMN "lifecycle_version" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "community_upload_manifests" ADD COLUMN "terminal_cleanup_at" timestamptz;--> statement-breakpoint
ALTER TABLE "community_media_candidates" ADD COLUMN "lifecycle_version" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "community_media_candidates" ADD COLUMN "terminal_cleanup_at" timestamptz;--> statement-breakpoint

ALTER TABLE "community_topic_reads" ADD COLUMN "last_read_created_at" timestamptz;--> statement-breakpoint
UPDATE "community_topic_reads" topic_read
SET "last_read_created_at" = message."created_at"
FROM "club_chat_messages" message
WHERE message."id" = topic_read."last_read_message_id";--> statement-breakpoint
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT constraint.conname INTO constraint_name
  FROM pg_constraint constraint
  JOIN pg_attribute attribute
    ON attribute.attrelid = constraint.conrelid
   AND attribute.attnum = ANY (constraint.conkey)
  WHERE constraint.conrelid = 'community_topic_reads'::regclass
    AND constraint.contype = 'f'
    AND attribute.attname = 'last_read_message_id'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE community_topic_reads DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;--> statement-breakpoint
UPDATE "community_topic_reads"
SET "last_read_created_at" = "last_read_at",
    "last_read_message_id" = COALESCE(
      "last_read_message_id",
      'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
    )
WHERE "last_read_message_id" IS NULL OR "last_read_created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "community_topic_reads" ALTER COLUMN "last_read_message_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "community_topic_reads" ALTER COLUMN "last_read_created_at" SET NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION community_sync_topic_read_tuple() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolved_created_at timestamptz;
DECLARE should_resolve boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_resolve := NEW.last_read_created_at IS NULL;
  ELSE
    should_resolve := NEW.last_read_message_id IS DISTINCT FROM OLD.last_read_message_id
      AND NEW.last_read_created_at IS NOT DISTINCT FROM OLD.last_read_created_at;
  END IF;

  IF should_resolve THEN
    SELECT message.created_at INTO resolved_created_at
    FROM club_chat_messages message
    WHERE message.id = NEW.last_read_message_id;
    NEW.last_read_created_at := COALESCE(resolved_created_at, NEW.last_read_at);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "community_sync_topic_read_tuple_trigger"
  BEFORE INSERT OR UPDATE OF last_read_message_id ON "community_topic_reads"
  FOR EACH ROW EXECUTE FUNCTION community_sync_topic_read_tuple();--> statement-breakpoint

CREATE TABLE "community_object_deletion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "source_id" uuid NOT NULL,
  "action" varchar(32) NOT NULL,
  "expected_lifecycle_version" integer,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "claim_id" uuid,
  "claimed_at" timestamptz,
  "not_before" timestamptz NOT NULL DEFAULT now(),
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_object_deletion_jobs_status_check" CHECK ("status" IN ('pending','claimed')),
  CONSTRAINT "community_object_deletion_jobs_action_check" CHECK ("action" IN ('objects_only','redact_message','delete_message','delete_attachment','delete_manifest')),
  CONSTRAINT "community_object_deletion_jobs_source_action_unique" UNIQUE ("source_type", "source_id", "action")
);--> statement-breakpoint
CREATE INDEX "community_object_deletion_jobs_claim_idx"
  ON "community_object_deletion_jobs" ("status", "not_before", "claimed_at");--> statement-breakpoint
CREATE TABLE "community_object_deletion_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "community_object_deletion_jobs"("id") ON DELETE CASCADE,
  "object_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_object_deletion_entries_job_key_unique" UNIQUE ("job_id", "object_key")
);--> statement-breakpoint
CREATE INDEX "community_object_deletion_entries_job_idx"
  ON "community_object_deletion_entries" ("job_id");--> statement-breakpoint
CREATE TABLE "community_object_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "source_id" uuid NOT NULL,
  "object_key" text NOT NULL,
  "publication_token" uuid NOT NULL DEFAULT gen_random_uuid(),
  "state" varchar(16) NOT NULL DEFAULT 'publishing',
  "quiesced_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_object_publications_source_key_unique" UNIQUE ("source_type", "source_id", "object_key"),
  CONSTRAINT "community_object_publications_state_check" CHECK ("state" IN ('publishing','quiescing'))
);--> statement-breakpoint
CREATE INDEX "community_object_publications_object_state_idx"
  ON "community_object_publications" ("object_key", "state", "quiesced_at");--> statement-breakpoint
CREATE TABLE "community_message_purge_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_key" varchar(160) NOT NULL,
  "topic_id" uuid NOT NULL,
  "user_id" uuid,
  "include_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "community_message_purge_requests_key_idx"
  ON "community_message_purge_requests" ("request_key");--> statement-breakpoint
CREATE INDEX "community_message_purge_requests_created_idx"
  ON "community_message_purge_requests" ("created_at", "id");--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_capture_object_deletion(
  capture_source_type text,
  capture_source_id uuid,
  capture_keys text[]
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE capture_job_id uuid;
BEGIN
  INSERT INTO community_object_deletion_jobs (source_type, source_id, action)
  VALUES (capture_source_type, capture_source_id, 'objects_only')
  ON CONFLICT (source_type, source_id, action) DO UPDATE
  SET status = 'pending', claim_id = NULL, claimed_at = NULL, updated_at = clock_timestamp()
  RETURNING id INTO capture_job_id;

  INSERT INTO community_object_deletion_entries (job_id, object_key)
  SELECT capture_job_id, key
  FROM unnest(capture_keys) key
  WHERE key IS NOT NULL AND key <> ''
  ON CONFLICT (job_id, object_key) DO NOTHING;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_capture_attachment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE manifest_record record;
BEGIN
  PERFORM community_capture_object_deletion('attachment', OLD.id, ARRAY[OLD.object_key]);
  FOR manifest_record IN
    SELECT manifest.id, manifest.staging_object_key, manifest.quarantine_object_key, manifest.final_object_key
    FROM community_upload_manifests manifest
    WHERE manifest.attachment_id = OLD.id
  LOOP
    PERFORM community_capture_object_deletion(
      'manifest', manifest_record.id,
      ARRAY[manifest_record.staging_object_key, manifest_record.quarantine_object_key, manifest_record.final_object_key]
    );
    PERFORM community_capture_object_deletion(
      'manifest_candidates', manifest_record.id,
      ARRAY(
        SELECT key
        FROM community_media_candidates candidate,
             LATERAL unnest(ARRAY[candidate.candidate_object_key, candidate.final_object_key]) key
        WHERE candidate.manifest_id = manifest_record.id
      )
    );
  END LOOP;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER "community_capture_attachment_delete_trigger"
  BEFORE DELETE ON "club_message_attachments"
  FOR EACH ROW EXECUTE FUNCTION community_capture_attachment_delete();--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_capture_manifest_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM community_capture_object_deletion(
    'manifest', OLD.id,
    ARRAY[OLD.staging_object_key, OLD.quarantine_object_key, OLD.final_object_key]
  );
  DELETE FROM community_media_candidates WHERE manifest_id = OLD.id;
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER "community_capture_manifest_delete_trigger"
  BEFORE DELETE ON "community_upload_manifests"
  FOR EACH ROW EXECUTE FUNCTION community_capture_manifest_delete();--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_capture_candidate_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM community_capture_object_deletion(
    'candidate', OLD.id,
    ARRAY[OLD.candidate_object_key, OLD.final_object_key]
  );
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER "community_capture_candidate_delete_trigger"
  BEFORE DELETE ON "community_media_candidates"
  FOR EACH ROW EXECUTE FUNCTION community_capture_candidate_delete();--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_enqueue_message_cleanup(
  cleanup_message_id uuid,
  cleanup_action text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cleanup_job_id uuid;
DECLARE cleanup_version integer;
BEGIN
  IF cleanup_action NOT IN ('redact_message', 'delete_message') THEN
    RAISE EXCEPTION 'invalid message cleanup action';
  END IF;

  UPDATE club_chat_messages
  SET terminal_cleanup_at = COALESCE(terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN terminal_cleanup_at IS NULL THEN lifecycle_version + 1 ELSE lifecycle_version END,
      updated_at = clock_timestamp()
  WHERE id = cleanup_message_id
  RETURNING lifecycle_version INTO cleanup_version;
  IF cleanup_version IS NULL THEN RETURN NULL; END IF;

  INSERT INTO community_object_deletion_jobs (
    source_type, source_id, action, expected_lifecycle_version, status, claim_id, claimed_at, last_error, updated_at
  ) VALUES (
    'message', cleanup_message_id, cleanup_action, cleanup_version, 'pending', NULL, NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (source_type, source_id, action) DO UPDATE
  SET expected_lifecycle_version = EXCLUDED.expected_lifecycle_version,
      status = 'pending', claim_id = NULL, claimed_at = NULL, last_error = NULL,
      updated_at = clock_timestamp()
  RETURNING id INTO cleanup_job_id;

  INSERT INTO community_object_deletion_entries (job_id, object_key)
  SELECT cleanup_job_id, object_key
  FROM (
    SELECT attachment.object_key
    FROM club_message_attachments attachment
    WHERE attachment.message_id = cleanup_message_id
    UNION
    SELECT key
    FROM community_upload_manifests manifest
    JOIN club_message_attachments attachment ON attachment.id = manifest.attachment_id
    CROSS JOIN LATERAL unnest(ARRAY[
      manifest.staging_object_key, manifest.quarantine_object_key, manifest.final_object_key
    ]) key
    WHERE attachment.message_id = cleanup_message_id
    UNION
    SELECT key
    FROM community_media_candidates candidate
    JOIN community_upload_manifests manifest ON manifest.id = candidate.manifest_id
    JOIN club_message_attachments attachment ON attachment.id = manifest.attachment_id
    CROSS JOIN LATERAL unnest(ARRAY[candidate.candidate_object_key, candidate.final_object_key]) key
    WHERE attachment.message_id = cleanup_message_id
  ) cleanup_keys
  WHERE object_key IS NOT NULL AND object_key <> ''
  ON CONFLICT (job_id, object_key) DO NOTHING;

  UPDATE club_message_attachments
  SET terminal_cleanup_at = COALESCE(terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN terminal_cleanup_at IS NULL THEN lifecycle_version + 1 ELSE lifecycle_version END
  WHERE message_id = cleanup_message_id;
  UPDATE community_upload_manifests manifest
  SET terminal_cleanup_at = COALESCE(manifest.terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN manifest.terminal_cleanup_at IS NULL THEN manifest.lifecycle_version + 1 ELSE manifest.lifecycle_version END,
      updated_at = clock_timestamp()
  FROM club_message_attachments attachment
  WHERE manifest.attachment_id = attachment.id AND attachment.message_id = cleanup_message_id;
  UPDATE community_media_candidates candidate
  SET terminal_cleanup_at = COALESCE(candidate.terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN candidate.terminal_cleanup_at IS NULL THEN candidate.lifecycle_version + 1 ELSE candidate.lifecycle_version END,
      updated_at = clock_timestamp()
  FROM community_upload_manifests manifest, club_message_attachments attachment
  WHERE candidate.manifest_id = manifest.id
    AND manifest.attachment_id = attachment.id
    AND attachment.message_id = cleanup_message_id;

  -- Re-read after installing every terminal fence so a worker that won just
  -- before the fence cannot publish a key that was absent from the first read.
  INSERT INTO community_object_deletion_entries (job_id, object_key)
  SELECT cleanup_job_id, object_key
  FROM (
    SELECT attachment.object_key
    FROM club_message_attachments attachment
    WHERE attachment.message_id = cleanup_message_id
    UNION
    SELECT key
    FROM community_upload_manifests manifest
    JOIN club_message_attachments attachment ON attachment.id = manifest.attachment_id
    CROSS JOIN LATERAL unnest(ARRAY[
      manifest.staging_object_key, manifest.quarantine_object_key, manifest.final_object_key
    ]) key
    WHERE attachment.message_id = cleanup_message_id
    UNION
    SELECT key
    FROM community_media_candidates candidate
    JOIN community_upload_manifests manifest ON manifest.id = candidate.manifest_id
    JOIN club_message_attachments attachment ON attachment.id = manifest.attachment_id
    CROSS JOIN LATERAL unnest(ARRAY[candidate.candidate_object_key, candidate.final_object_key]) key
    WHERE attachment.message_id = cleanup_message_id
  ) fenced_cleanup_keys
  WHERE object_key IS NOT NULL AND object_key <> ''
  ON CONFLICT (job_id, object_key) DO NOTHING;

  RETURN cleanup_job_id;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION community_enqueue_attachment_cleanup(
  cleanup_attachment_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cleanup_job_id uuid;
DECLARE cleanup_version integer;
BEGIN
  UPDATE club_message_attachments
  SET terminal_cleanup_at = COALESCE(terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN terminal_cleanup_at IS NULL THEN lifecycle_version + 1 ELSE lifecycle_version END
  WHERE id = cleanup_attachment_id AND deleted_at IS NULL
  RETURNING lifecycle_version INTO cleanup_version;
  IF cleanup_version IS NULL THEN RETURN NULL; END IF;

  INSERT INTO community_object_deletion_jobs (
    source_type, source_id, action, expected_lifecycle_version, status, claim_id, claimed_at, last_error, updated_at
  ) VALUES (
    'attachment', cleanup_attachment_id, 'delete_attachment', cleanup_version,
    'pending', NULL, NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (source_type, source_id, action) DO UPDATE
  SET expected_lifecycle_version = EXCLUDED.expected_lifecycle_version,
      status = 'pending', claim_id = NULL, claimed_at = NULL, last_error = NULL,
      updated_at = clock_timestamp()
  RETURNING id INTO cleanup_job_id;

  INSERT INTO community_object_deletion_entries (job_id, object_key)
  SELECT cleanup_job_id, key
  FROM (
    SELECT object_key AS key FROM club_message_attachments WHERE id = cleanup_attachment_id
    UNION
    SELECT key
    FROM community_upload_manifests manifest
    CROSS JOIN LATERAL unnest(ARRAY[
      manifest.staging_object_key, manifest.quarantine_object_key, manifest.final_object_key
    ]) key
    WHERE manifest.attachment_id = cleanup_attachment_id
    UNION
    SELECT key
    FROM community_media_candidates candidate
    JOIN community_upload_manifests manifest ON manifest.id = candidate.manifest_id
    CROSS JOIN LATERAL unnest(ARRAY[candidate.candidate_object_key, candidate.final_object_key]) key
    WHERE manifest.attachment_id = cleanup_attachment_id
  ) attachment_keys
  WHERE key IS NOT NULL AND key <> ''
  ON CONFLICT (job_id, object_key) DO NOTHING;

  UPDATE community_upload_manifests
  SET terminal_cleanup_at = COALESCE(terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN terminal_cleanup_at IS NULL THEN lifecycle_version + 1 ELSE lifecycle_version END,
      updated_at = clock_timestamp()
  WHERE attachment_id = cleanup_attachment_id;
  UPDATE community_media_candidates candidate
  SET terminal_cleanup_at = COALESCE(candidate.terminal_cleanup_at, clock_timestamp()),
      lifecycle_version = CASE WHEN candidate.terminal_cleanup_at IS NULL THEN candidate.lifecycle_version + 1 ELSE candidate.lifecycle_version END,
      updated_at = clock_timestamp()
  FROM community_upload_manifests manifest
  WHERE candidate.manifest_id = manifest.id AND manifest.attachment_id = cleanup_attachment_id;

  INSERT INTO community_object_deletion_entries (job_id, object_key)
  SELECT cleanup_job_id, key
  FROM (
    SELECT object_key AS key FROM club_message_attachments WHERE id = cleanup_attachment_id
    UNION
    SELECT key
    FROM community_upload_manifests manifest
    CROSS JOIN LATERAL unnest(ARRAY[
      manifest.staging_object_key, manifest.quarantine_object_key, manifest.final_object_key
    ]) key
    WHERE manifest.attachment_id = cleanup_attachment_id
    UNION
    SELECT key
    FROM community_media_candidates candidate
    JOIN community_upload_manifests manifest ON manifest.id = candidate.manifest_id
    CROSS JOIN LATERAL unnest(ARRAY[candidate.candidate_object_key, candidate.final_object_key]) key
    WHERE manifest.attachment_id = cleanup_attachment_id
  ) fenced_attachment_keys
  WHERE key IS NOT NULL AND key <> ''
  ON CONFLICT (job_id, object_key) DO NOTHING;
  RETURN cleanup_job_id;
END $$;--> statement-breakpoint

ALTER TABLE "app_notifications" ADD COLUMN "community_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "app_notifications" ADD COLUMN "community_access_version" integer;--> statement-breakpoint
UPDATE "app_notifications" notification
SET "community_topic_id" = message."topic_id",
    "community_access_version" = recipient."community_access_version"
FROM "club_chat_messages" message, "users" recipient
WHERE notification."source" IN ('community_reply','community_mention','community_all')
  AND notification."source_id" = message."id"
  AND notification."user_id" = recipient."id";--> statement-breakpoint
DELETE FROM "app_notifications"
WHERE "source" IN ('community_reply','community_mention','community_all')
  AND ("community_topic_id" IS NULL OR "community_access_version" IS NULL);--> statement-breakpoint
DELETE FROM "app_notifications" notification
USING (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, source, source_id
             ORDER BY created_at DESC, id DESC
           ) AS delivery_rank
    FROM app_notifications
    WHERE source IN ('community_reply','community_mention','community_all')
  ) ranked_deliveries
  WHERE delivery_rank > 1
) duplicate_delivery
WHERE notification.id = duplicate_delivery.id;--> statement-breakpoint
CREATE INDEX "app_notifications_community_access_idx"
  ON "app_notifications" ("user_id", "community_topic_id", "community_access_version")
  WHERE "community_topic_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "app_notifications_community_delivery_idx"
  ON "app_notifications" ("user_id", "source", "source_id")
  WHERE "source" IN ('community_reply','community_mention','community_all');--> statement-breakpoint

CREATE TABLE "community_notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "access_version" integer NOT NULL,
  "reason" varchar(16) NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "push_url" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "claim_id" uuid,
  "claimed_at" timestamptz,
  "delivered_at" timestamptz,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "last_error" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "community_notification_outbox_status_check" CHECK ("status" IN ('pending','claimed','delivered','suppressed')),
  CONSTRAINT "community_notification_outbox_reason_check" CHECK ("reason" IN ('reply','mention','all')),
  CONSTRAINT "community_notification_outbox_delivery_unique" UNIQUE ("user_id", "message_id", "reason")
);--> statement-breakpoint
CREATE INDEX "community_notification_outbox_claim_idx"
  ON "community_notification_outbox" ("status", "next_attempt_at", "claimed_at");--> statement-breakpoint
INSERT INTO "community_notification_outbox" (
  "user_id", "topic_id", "message_id", "access_version", "reason",
  "title", "body", "push_url", "status", "delivered_at", "created_at", "updated_at"
)
SELECT notification."user_id", notification."community_topic_id", notification."source_id",
       notification."community_access_version",
       CASE notification."source"
         WHEN 'community_reply' THEN 'reply'
         WHEN 'community_mention' THEN 'mention'
         ELSE 'all'
       END,
       'Новое уведомление', 'Откройте приложение, чтобы проверить обновления.',
       '/notifications', 'delivered',
       notification."created_at", notification."created_at", clock_timestamp()
FROM "app_notifications" notification
WHERE notification."source" IN ('community_reply','community_mention','community_all')
  AND notification."community_topic_id" IS NOT NULL
  AND notification."community_access_version" IS NOT NULL
ON CONFLICT ("user_id", "message_id", "reason") DO NOTHING;--> statement-breakpoint

CREATE OR REPLACE FUNCTION bump_community_access_version_for_user(target_user_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE users
  SET community_access_version = community_access_version + 1,
      updated_at = clock_timestamp()
  WHERE id = target_user_id;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION bump_community_access_version_from_subscription() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM bump_community_access_version_for_user(OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM bump_community_access_version_for_user(NEW.user_id);
  IF TG_OP = 'UPDATE' AND OLD.user_id <> NEW.user_id THEN
    PERFORM bump_community_access_version_for_user(OLD.user_id);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "subscriptions_community_access_version_trigger"
  AFTER INSERT OR UPDATE OF status, expires_at OR DELETE ON "subscriptions"
  FOR EACH ROW EXECUTE FUNCTION bump_community_access_version_from_subscription();--> statement-breakpoint
CREATE OR REPLACE FUNCTION bump_community_access_version_from_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE users
    SET community_access_version = community_access_version + 1,
        updated_at = clock_timestamp()
    WHERE lower(telegram_id) = lower(OLD.telegram_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR OLD.telegram_id <> NEW.telegram_id) THEN
    UPDATE users
    SET community_access_version = community_access_version + 1,
        updated_at = clock_timestamp()
    WHERE lower(telegram_id) = lower(NEW.telegram_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "admin_users_community_access_version_trigger"
  AFTER INSERT OR UPDATE OF telegram_id, is_active, permissions OR DELETE ON "admin_users"
  FOR EACH ROW EXECUTE FUNCTION bump_community_access_version_from_admin();--> statement-breakpoint

CREATE INDEX "club_chat_messages_terminal_cleanup_idx"
  ON "club_chat_messages" ("terminal_cleanup_at", "purge_at");--> statement-breakpoint
CREATE INDEX "club_message_attachments_terminal_cleanup_idx"
  ON "club_message_attachments" ("terminal_cleanup_at", "expires_at", "deleted_at");
