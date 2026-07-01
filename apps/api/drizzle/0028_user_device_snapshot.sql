ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "device_snapshot" jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "device_snapshot_at" timestamp with time zone;
