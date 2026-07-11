ALTER TABLE "auth_sessions" ADD COLUMN "last_ip_address" varchar(45);--> statement-breakpoint
CREATE TABLE "user_login_ips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"login_count" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_login_ips" ADD CONSTRAINT "user_login_ips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_login_ips_user_ip_idx" ON "user_login_ips" USING btree ("user_id", "ip_address");--> statement-breakpoint
CREATE INDEX "user_login_ips_user_last_seen_idx" ON "user_login_ips" USING btree ("user_id", "last_seen_at");
