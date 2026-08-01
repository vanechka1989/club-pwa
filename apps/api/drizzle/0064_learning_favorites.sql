CREATE TABLE "user_learning_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_learning_favorites_user_item_unique" UNIQUE("user_id", "content_item_id")
);
--> statement-breakpoint
ALTER TABLE "user_learning_favorites" ADD CONSTRAINT "user_learning_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_learning_favorites" ADD CONSTRAINT "user_learning_favorites_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_learning_favorites_user_created_idx" ON "user_learning_favorites" USING btree ("user_id", "created_at");
