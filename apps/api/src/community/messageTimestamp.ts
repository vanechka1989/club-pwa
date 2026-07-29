import { sql } from "drizzle-orm";
import { clubChatMessages } from "../db/schema";

export function preciseCommunityMessageCreatedAt() {
  return sql<string>`to_char(
    ${clubChatMessages.createdAt} at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  )`;
}

export function preciseCommunityMessageCreatedAtExtra() {
  return preciseCommunityMessageCreatedAt().as("precise_created_at");
}
