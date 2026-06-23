CREATE TYPE "public"."message_reaction" AS ENUM('like', 'dislike');--> statement-breakpoint
CREATE TABLE "club_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" "message_reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "club_message_reactions" ADD CONSTRAINT "club_message_reactions_message_id_club_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."club_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_message_reactions" ADD CONSTRAINT "club_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_message_reactions_message_user_idx" ON "club_message_reactions" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "club_message_reactions_message_reaction_idx" ON "club_message_reactions" USING btree ("message_id","reaction");--> statement-breakpoint
ALTER TABLE "club_chat_messages" ADD CONSTRAINT "club_chat_messages_reply_to_message_id_club_chat_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."club_chat_messages"("id") ON DELETE set null ON UPDATE no action;