CREATE TABLE "user_content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_content_progress_user_item_idx" ON "user_content_progress" USING btree ("user_id","content_item_id");--> statement-breakpoint
CREATE INDEX "user_content_progress_user_last_opened_idx" ON "user_content_progress" USING btree ("user_id","last_opened_at");--> statement-breakpoint
CREATE INDEX "user_content_progress_user_completed_idx" ON "user_content_progress" USING btree ("user_id","completed_at");