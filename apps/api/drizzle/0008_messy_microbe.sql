ALTER TYPE "public"."message_reaction" ADD VALUE 'thumbs_up';--> statement-breakpoint
ALTER TYPE "public"."message_reaction" ADD VALUE 'fire';--> statement-breakpoint
ALTER TYPE "public"."message_reaction" ADD VALUE 'heart';--> statement-breakpoint
ALTER TYPE "public"."message_reaction" ADD VALUE 'laugh';--> statement-breakpoint
ALTER TYPE "public"."message_reaction" ADD VALUE 'clap';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_url" text;