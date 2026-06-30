ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "role_label" varchar(80);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '["statistics","users","mailings","payments","materials","support","community","storage","admins"]'::jsonb NOT NULL;
