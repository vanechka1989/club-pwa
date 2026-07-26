ALTER TABLE "content_categories" ADD COLUMN "archived_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "content_categories_archive_idx" ON "content_categories" USING btree ("archived_until");
