ALTER TABLE "homework_submissions" ADD COLUMN "reset_at" timestamp with time zone;
ALTER TABLE "homework_submissions" ADD COLUMN "reset_by_user_id" uuid;
ALTER TABLE "homework_submissions" ADD COLUMN "reset_reason" text;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reset_by_user_id_users_id_fk" FOREIGN KEY ("reset_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "app_notifications_assessment_reset_unique" ON "app_notifications" USING btree ("user_id","source","source_id") WHERE "source" = 'lesson_assessment_reset';
CREATE UNIQUE INDEX "admin_action_logs_homework_reset_unique" ON "admin_action_logs" USING btree ("action","entity_type","entity_id") WHERE "action" = 'learning.homework.reset';
