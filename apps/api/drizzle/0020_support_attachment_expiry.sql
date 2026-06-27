ALTER TABLE "support_ticket_attachments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "support_ticket_attachments" SET "expires_at" = "created_at" + interval '7 days' WHERE "expires_at" IS NULL;--> statement-breakpoint
CREATE INDEX "support_ticket_attachments_expires_at_idx" ON "support_ticket_attachments" USING btree ("expires_at");
