import type { UserRole } from "@club/shared";

export type MessageDeletionScope = "message" | "topic";

const singleMessagePurgeDelayMs = 30 * 60 * 1000;
const topicPurgeDelayMs = 24 * 60 * 60 * 1000;

export function shouldHardDeleteMessages(role: UserRole) {
  return role === "owner";
}

export function getMessagePurgeAt(scope: MessageDeletionScope, role: UserRole, now = new Date()) {
  if (shouldHardDeleteMessages(role)) {
    return null;
  }

  const delay = scope === "topic" ? topicPurgeDelayMs : singleMessagePurgeDelayMs;
  return new Date(now.getTime() + delay);
}
