ALTER TABLE "users" ALTER COLUMN "telegram_id" SET DATA TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(320);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "email" = lower("username") WHERE "username" LIKE '%@%' AND "email" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "telegram_id" SET DATA TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "admin_action_logs" ALTER COLUMN "actor_telegram_id" SET DATA TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "admin_action_logs" ALTER COLUMN "target_telegram_id" SET DATA TYPE varchar(320);
--> statement-breakpoint
ALTER TABLE "admin_mailing_recipients" ALTER COLUMN "telegram_id" SET DATA TYPE varchar(320);
--> statement-breakpoint
CREATE TABLE "auth_email_login_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_email_login_codes_email_created_idx" ON "auth_email_login_codes" USING btree ("email","created_at");
--> statement-breakpoint
CREATE INDEX "auth_email_login_codes_code_hash_idx" ON "auth_email_login_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_idx" ON "auth_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id","expires_at");
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");
--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id","revoked_at");
