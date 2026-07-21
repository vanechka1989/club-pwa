CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_updated_at_idx" ON "users" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_last_seen_idx" ON "auth_sessions" USING btree ("user_id","last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_created_at_idx" ON "payment_orders" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_status_created_at_idx" ON "payment_orders" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_chat_messages_created_at_idx" ON "club_chat_messages" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_polls_created_at_idx" ON "club_polls" USING btree ("created_at");
