import type { UserRole } from "@club/shared";

export type CommunityTopicAccess = {
  isAdminOnly: boolean;
  isPublished?: boolean;
};

export function isTopicAccessibleForRole(topic: CommunityTopicAccess, role: UserRole) {
  if (role !== "member") {
    return true;
  }

  return !topic.isAdminOnly && topic.isPublished !== false;
}
