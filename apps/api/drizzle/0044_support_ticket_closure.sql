ALTER TABLE "support_tickets" ADD COLUMN "closed_at" timestamp with time zone;
ALTER TABLE "support_tickets" ADD COLUMN "closed_by_user_id" uuid;
DO $$ BEGIN
 ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
