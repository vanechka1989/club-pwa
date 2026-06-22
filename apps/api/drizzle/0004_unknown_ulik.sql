DROP INDEX "club_chat_topics_chat_pinned_created_idx";--> statement-breakpoint
ALTER TABLE "club_chat_topics" ADD COLUMN "is_published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "club_chat_topics_chat_pinned_created_idx" ON "club_chat_topics" USING btree ("chat_id","is_published","is_pinned","created_at");