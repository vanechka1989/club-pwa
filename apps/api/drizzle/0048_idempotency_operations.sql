CREATE TABLE "idempotency_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_telegram_id" varchar(320) NOT NULL,
	"scope" varchar(96) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"resource_id" uuid,
	"error_code" varchar(96),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_operations" ADD CONSTRAINT "idempotency_operations_resource_id_content_items_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_operations_actor_scope_key_idx" ON "idempotency_operations" USING btree ("actor_telegram_id","scope","idempotency_key");
--> statement-breakpoint
CREATE INDEX "idempotency_operations_expires_idx" ON "idempotency_operations" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idempotency_operations_resource_idx" ON "idempotency_operations" USING btree ("resource_id");
