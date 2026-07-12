ALTER TABLE "club_chat_messages" ADD COLUMN "kind" varchar(16) DEFAULT 'text' NOT NULL;--> statement-breakpoint
CREATE TABLE "club_message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "kind" varchar(16) NOT NULL,
  "object_key" text NOT NULL,
  "content_type" varchar(160) NOT NULL,
  "size_bytes" integer NOT NULL,
  "duration_seconds" integer,
  "width" integer,
  "height" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "club_polls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "question" varchar(500) NOT NULL,
  "allows_multiple" boolean DEFAULT false NOT NULL,
  "is_anonymous" boolean DEFAULT true NOT NULL,
  "closes_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "club_poll_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "poll_id" uuid NOT NULL,
  "text" varchar(300) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "club_poll_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "poll_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "club_message_attachments" ADD CONSTRAINT "club_message_attachments_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."club_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_polls" ADD CONSTRAINT "club_polls_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."club_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_options" ADD CONSTRAINT "club_poll_options_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."club_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."club_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."club_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_message_attachments_message_sort_idx" ON "club_message_attachments" USING btree ("message_id", "sort_order");--> statement-breakpoint
CREATE INDEX "club_message_attachments_expiry_idx" ON "club_message_attachments" USING btree ("expires_at", "deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_polls_message_idx" ON "club_polls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "club_poll_options_poll_sort_idx" ON "club_poll_options" USING btree ("poll_id", "sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "club_poll_votes_poll_user_option_idx" ON "club_poll_votes" USING btree ("poll_id", "user_id", "option_id");--> statement-breakpoint
CREATE INDEX "club_poll_votes_poll_idx" ON "club_poll_votes" USING btree ("poll_id");
