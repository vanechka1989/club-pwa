ALTER TABLE "users" ADD COLUMN "phone" varchar(32);
ALTER TABLE "users" ADD COLUMN "phone_source" varchar(24);
ALTER TABLE "users" ADD COLUMN "phone_updated_at" timestamp with time zone;
