ALTER TABLE "user_content_progress" ADD COLUMN "last_opened_material_id" uuid;

DO $$ BEGIN
 ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_last_opened_material_id_lesson_materials_id_fk" FOREIGN KEY ("last_opened_material_id") REFERENCES "public"."lesson_materials"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "user_content_progress_last_material_idx" ON "user_content_progress" USING btree ("last_opened_material_id");
