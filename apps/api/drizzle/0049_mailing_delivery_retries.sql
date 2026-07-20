ALTER TABLE "admin_mailing_recipients" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "next_attempt_at" timestamp with time zone;
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "last_attempt_at" timestamp with time zone;

CREATE INDEX "admin_mailing_recipients_retry_idx"
  ON "admin_mailing_recipients" ("status", "next_attempt_at", "updated_at");
