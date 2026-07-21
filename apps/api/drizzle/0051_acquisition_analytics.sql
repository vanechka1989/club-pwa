CREATE TABLE "acquisition_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "aid" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "source" varchar(80) NOT NULL,
  "medium" varchar(80) NOT NULL,
  "campaign" varchar(120) NOT NULL,
  "content" varchar(120),
  "destination_kind" varchar(16) DEFAULT 'home' NOT NULL,
  "destination_module_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "acquisition_visitors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "visitor_hash" varchar(64) NOT NULL,
  "first_visited_at" timestamp with time zone NOT NULL,
  "last_visited_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "acquisition_visits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "visitor_id" uuid NOT NULL,
  "link_id" uuid NOT NULL,
  "user_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user_acquisition_attributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "first_visit_id" uuid NOT NULL,
  "last_visit_id" uuid NOT NULL,
  "first_link_id" uuid NOT NULL,
  "last_link_id" uuid NOT NULL,
  "registered_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "acquisition_links" ADD CONSTRAINT "acquisition_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "acquisition_visits" ADD CONSTRAINT "acquisition_visits_visitor_id_acquisition_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."acquisition_visitors"("id") ON DELETE cascade;
ALTER TABLE "acquisition_visits" ADD CONSTRAINT "acquisition_visits_link_id_acquisition_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."acquisition_links"("id") ON DELETE restrict;
ALTER TABLE "acquisition_visits" ADD CONSTRAINT "acquisition_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "user_acquisition_attributions" ADD CONSTRAINT "user_acquisition_attributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "user_acquisition_attributions" ADD CONSTRAINT "user_acquisition_attributions_first_visit_id_acquisition_visits_id_fk" FOREIGN KEY ("first_visit_id") REFERENCES "public"."acquisition_visits"("id") ON DELETE restrict;
ALTER TABLE "user_acquisition_attributions" ADD CONSTRAINT "user_acquisition_attributions_last_visit_id_acquisition_visits_id_fk" FOREIGN KEY ("last_visit_id") REFERENCES "public"."acquisition_visits"("id") ON DELETE restrict;
ALTER TABLE "user_acquisition_attributions" ADD CONSTRAINT "user_acquisition_attributions_first_link_id_acquisition_links_id_fk" FOREIGN KEY ("first_link_id") REFERENCES "public"."acquisition_links"("id") ON DELETE restrict;
ALTER TABLE "user_acquisition_attributions" ADD CONSTRAINT "user_acquisition_attributions_last_link_id_acquisition_links_id_fk" FOREIGN KEY ("last_link_id") REFERENCES "public"."acquisition_links"("id") ON DELETE restrict;

CREATE UNIQUE INDEX "acquisition_links_aid_idx" ON "acquisition_links" ("aid");
CREATE INDEX "acquisition_links_created_idx" ON "acquisition_links" ("created_at");
CREATE UNIQUE INDEX "acquisition_visitors_hash_idx" ON "acquisition_visitors" ("visitor_hash");
CREATE INDEX "acquisition_visits_link_time_idx" ON "acquisition_visits" ("link_id", "occurred_at");
CREATE INDEX "acquisition_visits_visitor_time_idx" ON "acquisition_visits" ("visitor_id", "occurred_at");
CREATE INDEX "acquisition_visits_user_time_idx" ON "acquisition_visits" ("user_id", "occurred_at");
CREATE UNIQUE INDEX "user_acquisition_attributions_user_idx" ON "user_acquisition_attributions" ("user_id");
CREATE INDEX "user_acquisition_attributions_first_link_idx" ON "user_acquisition_attributions" ("first_link_id", "registered_at");
CREATE INDEX "user_acquisition_attributions_last_link_idx" ON "user_acquisition_attributions" ("last_link_id", "registered_at");
