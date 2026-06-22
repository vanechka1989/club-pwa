CREATE TYPE "public"."moderation_status" AS ENUM('visible', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."mute_kind" AS ENUM('temporary', 'permanent');--> statement-breakpoint
CREATE TABLE "club_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "moderation_status" DEFAULT 'visible' NOT NULL,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_chat_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "moderation_status" DEFAULT 'visible' NOT NULL,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "mute_kind" NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD CONSTRAINT "club_chat_messages_topic_id_club_chat_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."club_chat_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD CONSTRAINT "club_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD CONSTRAINT "club_chat_messages_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chat_topics" ADD CONSTRAINT "club_chat_topics_chat_id_club_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."club_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chat_topics" ADD CONSTRAINT "club_chat_topics_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_chats" ADD CONSTRAINT "club_chats_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_comments" ADD CONSTRAINT "lesson_comments_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_chat_messages_topic_status_created_idx" ON "club_chat_messages" USING btree ("topic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "club_chat_messages_user_created_idx" ON "club_chat_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "club_chat_topics_chat_pinned_created_idx" ON "club_chat_topics" USING btree ("chat_id","is_pinned","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_chats_slug_idx" ON "club_chats" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "club_chats_published_sort_idx" ON "club_chats" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "lesson_comments_item_status_created_idx" ON "lesson_comments" USING btree ("content_item_id","status","created_at");--> statement-breakpoint
CREATE INDEX "lesson_comments_user_created_idx" ON "lesson_comments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_mutes_user_active_idx" ON "user_mutes" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "user_mutes_created_idx" ON "user_mutes" USING btree ("created_at");