CREATE TABLE "admin_action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_telegram_id" varchar(32) NOT NULL,
	"action" varchar(96) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(128),
	"target_user_id" uuid,
	"target_telegram_id" varchar(32),
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_action_logs" ADD CONSTRAINT "admin_action_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_action_logs_actor_created_idx" ON "admin_action_logs" USING btree ("actor_telegram_id","created_at");
--> statement-breakpoint
CREATE INDEX "admin_action_logs_action_created_idx" ON "admin_action_logs" USING btree ("action","created_at");
--> statement-breakpoint
CREATE INDEX "admin_action_logs_entity_idx" ON "admin_action_logs" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "admin_action_logs_target_created_idx" ON "admin_action_logs" USING btree ("target_telegram_id","created_at");
--> statement-breakpoint
CREATE INDEX "admin_action_logs_created_idx" ON "admin_action_logs" USING btree ("created_at");
