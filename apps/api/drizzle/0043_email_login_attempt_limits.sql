CREATE TABLE "auth_email_login_attempt_limits" (
  "scope_key" varchar(64) PRIMARY KEY NOT NULL,
  "scope" varchar(24) NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
