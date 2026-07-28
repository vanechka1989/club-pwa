CREATE TABLE "community_topic_reads" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "club_chat_topics"("id") ON DELETE CASCADE,
  "last_read_message_id" uuid REFERENCES "club_chat_messages"("id") ON DELETE SET NULL,
  "last_read_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_id")
);--> statement-breakpoint
CREATE TABLE "community_topic_notification_settings" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "club_chat_topics"("id") ON DELETE CASCADE,
  "mode" varchar(16) NOT NULL DEFAULT 'mentions' CHECK ("mode" IN ('all','mentions','off')),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_id")
);--> statement-breakpoint
CREATE TABLE "club_message_mentions" (
  "message_id" uuid NOT NULL REFERENCES "club_chat_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  PRIMARY KEY ("message_id", "user_id")
);--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "client_operation_id" varchar(96);--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "edited_at" timestamptz;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_by_user_at" timestamptz;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_content_expires_at" timestamptz;--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "scan_status" varchar(16) NOT NULL DEFAULT 'ready';--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "scanned_at" timestamptz;--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD COLUMN "scan_error" varchar(160);--> statement-breakpoint
CREATE UNIQUE INDEX "club_chat_messages_user_operation_idx"
  ON "club_chat_messages" ("user_id", "client_operation_id")
  WHERE "client_operation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "club_message_attachments_object_key_idx" ON "club_message_attachments" ("object_key");--> statement-breakpoint
CREATE INDEX "club_chat_messages_search_idx"
  ON "club_chat_messages" USING gin (to_tsvector('simple', coalesce("body", '')));--> statement-breakpoint
CREATE INDEX "club_chat_messages_deleted_expiry_idx" ON "club_chat_messages" ("deleted_content_expires_at");
