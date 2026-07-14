ALTER TABLE "content_items" ADD COLUMN "cover_mode" varchar(24) DEFAULT 'default' NOT NULL;--> statement-breakpoint
UPDATE "content_items"
SET "cover_mode" = 'custom'
WHERE "thumbnail_url" IS NOT NULL OR "thumbnail_object_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "content_items"
ADD CONSTRAINT "content_items_cover_mode_check"
CHECK ("cover_mode" IN ('default', 'custom', 'first_material'));
