ALTER TABLE "content_items" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "thumbnail_object_key" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "thumbnail_content_type" varchar(160);--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "thumbnail_size_bytes" integer;
