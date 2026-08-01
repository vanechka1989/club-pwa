ALTER TABLE "content_items" ADD COLUMN "assessment_mode" varchar(16) DEFAULT 'none' NOT NULL;
ALTER TABLE "content_items" ADD COLUMN "published_assessment_revision_id" uuid;

CREATE TABLE "lesson_assessment_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_item_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "mode" varchar(16) NOT NULL,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "title" varchar(180) NOT NULL,
  "instructions" text,
  "passing_percent" integer,
  "max_attempts" integer,
  "due_at" timestamp with time zone,
  "allow_text" boolean,
  "allow_attachments" boolean,
  "allowed_file_kinds" jsonb,
  "max_attachments" integer,
  "created_by_user_id" uuid NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_assessment_revisions_lesson_revision_unique" UNIQUE("content_item_id","revision"),
  CONSTRAINT "lesson_assessment_revisions_mode_check" CHECK ("mode" IN ('quiz', 'homework')),
  CONSTRAINT "lesson_assessment_revisions_status_check" CHECK ("status" IN ('draft', 'published', 'superseded')),
  CONSTRAINT "lesson_assessment_revisions_quiz_values_check" CHECK ("mode" <> 'quiz' OR ("passing_percent" BETWEEN 1 AND 100 AND "max_attempts" BETWEEN 1 AND 100)),
  CONSTRAINT "lesson_assessment_revisions_homework_values_check" CHECK ("mode" <> 'homework' OR (COALESCE("allow_text", false) OR COALESCE("allow_attachments", false)))
);

CREATE TABLE "lesson_assessment_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "revision_id" uuid NOT NULL,
  "stable_key" varchar(96) NOT NULL,
  "type" varchar(24) NOT NULL,
  "prompt" text NOT NULL,
  "points" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_assessment_questions_revision_key_unique" UNIQUE("revision_id","stable_key"),
  CONSTRAINT "lesson_assessment_questions_type_check" CHECK ("type" IN ('single_choice', 'multiple_choice', 'free_text')),
  CONSTRAINT "lesson_assessment_questions_points_check" CHECK ("points" > 0)
);

CREATE TABLE "lesson_assessment_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL,
  "stable_key" varchar(96) NOT NULL,
  "text" text NOT NULL,
  "is_correct" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_assessment_options_question_key_unique" UNIQUE("question_id","stable_key")
);

CREATE TABLE "quiz_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content_item_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "status" varchar(24) DEFAULT 'in_progress' NOT NULL,
  "earned_points" integer,
  "max_points" integer,
  "percent" integer,
  "submission_key" varchar(128),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quiz_attempts_user_lesson_number_unique" UNIQUE("user_id","content_item_id","attempt_number"),
  CONSTRAINT "quiz_attempts_submission_key_unique" UNIQUE("submission_key"),
  CONSTRAINT "quiz_attempts_status_check" CHECK ("status" IN ('in_progress', 'pending_review', 'passed', 'failed'))
);

CREATE TABLE "quiz_attempt_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attempt_id" uuid NOT NULL,
  "source_question_id" uuid,
  "question_key" varchar(96) NOT NULL,
  "type" varchar(24) NOT NULL,
  "prompt" text NOT NULL,
  "points" integer NOT NULL,
  "options_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "correct_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quiz_attempt_questions_attempt_key_unique" UNIQUE("attempt_id","question_key")
);

CREATE TABLE "quiz_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attempt_id" uuid NOT NULL,
  "question_snapshot_id" uuid NOT NULL,
  "selected_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "text" text,
  "reviewed_points" integer,
  "saved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quiz_answers_attempt_question_unique" UNIQUE("attempt_id","question_snapshot_id")
);

CREATE TABLE "homework_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content_item_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "text" text,
  "submission_key" varchar(128),
  "submitted_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "homework_submissions_user_lesson_version_unique" UNIQUE("user_id","content_item_id","version"),
  CONSTRAINT "homework_submissions_submission_key_unique" UNIQUE("submission_key"),
  CONSTRAINT "homework_submissions_status_check" CHECK ("status" IN ('draft', 'pending_review', 'needs_revision', 'accepted'))
);

CREATE TABLE "homework_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "object_key" text NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "content_type" varchar(160) NOT NULL,
  "size_bytes" integer NOT NULL,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "homework_attachments_object_key_unique" UNIQUE("object_key")
);

CREATE TABLE "assessment_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quiz_attempt_id" uuid,
  "homework_submission_id" uuid,
  "reviewed_by_user_id" uuid NOT NULL,
  "decision" varchar(24) NOT NULL,
  "comment" text,
  "question_points" jsonb,
  "idempotency_key" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assessment_reviews_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "assessment_reviews_quiz_attempt_unique" UNIQUE("quiz_attempt_id"),
  CONSTRAINT "assessment_reviews_homework_submission_unique" UNIQUE("homework_submission_id"),
  CONSTRAINT "assessment_reviews_one_target_check" CHECK (num_nonnulls("quiz_attempt_id", "homework_submission_id") = 1)
);

CREATE TABLE "quiz_attempt_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content_item_id" uuid NOT NULL,
  "reset_by_user_id" uuid NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "lesson_assessment_revisions" ADD CONSTRAINT "lesson_assessment_revisions_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE;
ALTER TABLE "lesson_assessment_revisions" ADD CONSTRAINT "lesson_assessment_revisions_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "lesson_assessment_questions" ADD CONSTRAINT "lesson_assessment_questions_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "lesson_assessment_revisions"("id") ON DELETE CASCADE;
ALTER TABLE "lesson_assessment_options" ADD CONSTRAINT "lesson_assessment_options_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "lesson_assessment_questions"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "lesson_assessment_revisions"("id") ON DELETE RESTRICT;
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_source_question_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "lesson_assessment_questions"("id") ON DELETE SET NULL;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_snapshot_id_fk" FOREIGN KEY ("question_snapshot_id") REFERENCES "quiz_attempt_questions"("id") ON DELETE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "lesson_assessment_revisions"("id") ON DELETE RESTRICT;
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE;
ALTER TABLE "assessment_reviews" ADD CONSTRAINT "assessment_reviews_quiz_attempt_id_fk" FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE;
ALTER TABLE "assessment_reviews" ADD CONSTRAINT "assessment_reviews_homework_submission_id_fk" FOREIGN KEY ("homework_submission_id") REFERENCES "homework_submissions"("id") ON DELETE CASCADE;
ALTER TABLE "assessment_reviews" ADD CONSTRAINT "assessment_reviews_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "quiz_attempt_resets" ADD CONSTRAINT "quiz_attempt_resets_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempt_resets" ADD CONSTRAINT "quiz_attempt_resets_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempt_resets" ADD CONSTRAINT "quiz_attempt_resets_reset_by_user_id_fk" FOREIGN KEY ("reset_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_published_assessment_revision_id_fk" FOREIGN KEY ("published_assessment_revision_id") REFERENCES "lesson_assessment_revisions"("id") ON DELETE SET NULL;

CREATE INDEX "lesson_assessment_revisions_lesson_status_idx" ON "lesson_assessment_revisions" ("content_item_id", "status");
CREATE INDEX "lesson_assessment_questions_revision_sort_idx" ON "lesson_assessment_questions" ("revision_id", "sort_order");
CREATE INDEX "lesson_assessment_options_question_sort_idx" ON "lesson_assessment_options" ("question_id", "sort_order");
CREATE UNIQUE INDEX "quiz_attempts_user_lesson_open_unique" ON "quiz_attempts" ("user_id", "content_item_id") WHERE "status" = 'in_progress';
CREATE INDEX "quiz_attempts_review_queue_idx" ON "quiz_attempts" ("status", "submitted_at");
CREATE INDEX "quiz_attempt_questions_attempt_sort_idx" ON "quiz_attempt_questions" ("attempt_id", "sort_order");
CREATE INDEX "homework_submissions_review_queue_idx" ON "homework_submissions" ("status", "submitted_at");
CREATE INDEX "homework_attachments_submission_idx" ON "homework_attachments" ("submission_id");
CREATE INDEX "homework_attachments_unconfirmed_idx" ON "homework_attachments" ("confirmed_at", "created_at");
CREATE INDEX "quiz_attempt_resets_user_lesson_created_idx" ON "quiz_attempt_resets" ("user_id", "content_item_id", "created_at");
