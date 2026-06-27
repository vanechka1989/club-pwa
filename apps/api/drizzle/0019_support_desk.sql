ALTER TABLE "support_tickets" ADD COLUMN "custom_topic" varchar(160);
ALTER TABLE "support_tickets" ADD COLUMN "last_customer_message_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "support_tickets" ADD COLUMN "last_admin_message_at" timestamp with time zone;
ALTER TABLE "support_tickets" ADD COLUMN "customer_read_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "support_tickets" ADD COLUMN "admin_read_at" timestamp with time zone;

UPDATE "support_tickets"
SET
  "last_customer_message_at" = "created_at",
  "customer_read_at" = "created_at";

CREATE TABLE "support_ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "author_user_id" uuid NOT NULL,
  "author_role" varchar(16) NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "support_ticket_messages" ("ticket_id", "author_user_id", "author_role", "body", "created_at", "updated_at")
SELECT "id", "user_id", 'customer', "message", "created_at", "updated_at"
FROM "support_tickets";

CREATE TABLE "support_ticket_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "kind" varchar(16) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "object_key" text NOT NULL,
  "content_type" varchar(120) NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_message_id_support_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_ticket_messages"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "support_ticket_messages_ticket_created_idx" ON "support_ticket_messages" USING btree ("ticket_id", "created_at");
CREATE INDEX "support_ticket_attachments_ticket_idx" ON "support_ticket_attachments" USING btree ("ticket_id");
