ALTER TABLE "quiz_attempt_resets" ADD COLUMN IF NOT EXISTS "quiz_attempt_id" uuid;

DO $$ BEGIN
  ALTER TABLE "quiz_attempt_resets"
    ADD CONSTRAINT "quiz_attempt_resets_quiz_attempt_id_fk"
    FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempts"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "quiz_attempt_resets_quiz_attempt_unique"
  ON "quiz_attempt_resets" ("quiz_attempt_id");
