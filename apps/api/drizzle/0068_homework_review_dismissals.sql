CREATE TABLE IF NOT EXISTS "homework_review_dismissals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "homework_submission_id" uuid NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "homework_review_dismissals_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "homework_review_dismissals_homework_submission_id_fk"
    FOREIGN KEY ("homework_submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "homework_review_dismissals_user_submission_unique"
  ON "homework_review_dismissals" ("user_id", "homework_submission_id");

CREATE INDEX IF NOT EXISTS "homework_review_dismissals_user_dismissed_idx"
  ON "homework_review_dismissals" ("user_id", "dismissed_at");
