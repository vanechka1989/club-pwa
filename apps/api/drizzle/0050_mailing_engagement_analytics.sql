ALTER TABLE "admin_mailings" ADD COLUMN "analytics_enabled_at" timestamp with time zone;

CREATE TABLE "admin_mailing_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mailing_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "event_type" varchar(16) NOT NULL,
  "event_key" varchar(80) NOT NULL,
  "destination" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "admin_mailing_events"
  ADD CONSTRAINT "admin_mailing_events_mailing_id_admin_mailings_id_fk"
  FOREIGN KEY ("mailing_id") REFERENCES "public"."admin_mailings"("id") ON DELETE cascade;
ALTER TABLE "admin_mailing_events"
  ADD CONSTRAINT "admin_mailing_events_recipient_id_admin_mailing_recipients_id_fk"
  FOREIGN KEY ("recipient_id") REFERENCES "public"."admin_mailing_recipients"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "admin_mailing_events_recipient_key_idx"
  ON "admin_mailing_events" ("recipient_id", "event_key");
CREATE INDEX "admin_mailing_events_mailing_type_time_idx"
  ON "admin_mailing_events" ("mailing_id", "event_type", "occurred_at");
CREATE INDEX "admin_mailing_events_mailing_time_idx"
  ON "admin_mailing_events" ("mailing_id", "occurred_at");
