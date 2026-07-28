ALTER TABLE "club_chat_messages" ADD COLUMN "create_request_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_cleanup_claim_id" uuid;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "deleted_cleanup_claimed_at" timestamptz;--> statement-breakpoint
CREATE INDEX "club_chat_messages_deleted_cleanup_idx"
  ON "club_chat_messages" ("deleted_content_expires_at", "deleted_cleanup_claimed_at");
