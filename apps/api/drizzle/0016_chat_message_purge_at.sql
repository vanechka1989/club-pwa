ALTER TABLE "club_chat_messages" ADD COLUMN "purge_at" timestamp with time zone;
CREATE INDEX "club_chat_messages_purge_at_idx" ON "club_chat_messages" USING btree ("purge_at");
