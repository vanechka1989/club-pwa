CREATE TABLE "learning_engagement_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"material_id" uuid,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"video_seconds" integer DEFAULT 0 NOT NULL,
	"playback_position_seconds" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_engagement_sessions" ADD CONSTRAINT "learning_engagement_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_engagement_sessions" ADD CONSTRAINT "learning_engagement_sessions_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_engagement_sessions" ADD CONSTRAINT "learning_engagement_sessions_material_id_lesson_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."lesson_materials"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "learning_engagement_content_activity_idx" ON "learning_engagement_sessions" USING btree ("content_item_id","last_activity_at");
--> statement-breakpoint
CREATE INDEX "learning_engagement_user_activity_idx" ON "learning_engagement_sessions" USING btree ("user_id","last_activity_at");
