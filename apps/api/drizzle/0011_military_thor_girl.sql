ALTER TYPE "public"."content_kind" ADD VALUE 'audio';--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "media_object_key" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "media_content_type" varchar(160);--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "media_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD COLUMN "playback_position_seconds" integer DEFAULT 0 NOT NULL;