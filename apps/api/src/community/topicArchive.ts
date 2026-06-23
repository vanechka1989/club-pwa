import type { UserRole } from "@club/shared";

type TopicArchiveState = {
  isPublished: boolean;
  archivedUntil: Date | null;
};

export function getArchiveExpirationDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + 7);
  return date;
}

export function isTopicVisibleForRole(topic: TopicArchiveState, role: UserRole, now = new Date()) {
  if (topic.isPublished) {
    return true;
  }

  return role !== "member" && Boolean(topic.archivedUntil && topic.archivedUntil > now);
}
