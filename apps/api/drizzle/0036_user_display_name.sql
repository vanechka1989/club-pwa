ALTER TABLE "users" ADD COLUMN "display_name" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name_changed_by_user_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_lower_idx" ON "users" USING btree (lower("display_name"));
