ALTER TABLE "club_chat_messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "pinned_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD CONSTRAINT "club_chat_messages_pinned_by_user_id_users_id_fk" FOREIGN KEY ("pinned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_chat_messages_topic_pinned_idx" ON "club_chat_messages" USING btree ("topic_id", "pinned_at");
