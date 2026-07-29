import type { AdminPermission, UserRole } from "@club/shared";
import { getMessageContentView } from "../community/messageMetadata";
import { isTopicAccessibleForRole } from "../community/topicAccess";

export type AdminCommunityViewer = {
  allowed: boolean;
  role: UserRole;
};

export function createAdminCommunityViewer(profile: {
  isOwner: boolean;
  isActive: boolean;
  permissions: AdminPermission[];
  role: UserRole;
}): AdminCommunityViewer {
  return {
    allowed: profile.isOwner || profile.isActive && profile.permissions.includes("community"),
    role: profile.isOwner ? "owner" : profile.role
  };
}

type AdminCommunityMessageSource = {
  id: string;
  body: string;
  status: "visible" | "hidden" | "deleted";
  deletedByUserAt: Date | null;
  deletedContentExpiresAt: Date | null;
  preciseCreatedAt?: string | null;
  createdAt: Date;
  topic: {
    title: string;
    isAdminOnly: boolean;
    isPublished?: boolean;
  };
};

export function projectAdminCommunityModerationMessage(
  message: AdminCommunityMessageSource,
  viewer: AdminCommunityViewer,
  now = new Date()
) {
  if (!viewer.allowed || !isTopicAccessibleForRole(message.topic, viewer.role)) return null;
  const content = getMessageContentView(message, viewer.role, now);
  return {
    id: message.id,
    body: content.body,
    status: message.status,
    sourceTitle: message.topic.title,
    createdAt: message.preciseCreatedAt ?? message.createdAt.toISOString()
  };
}

export function sortAdminTimelineNewestFirst<T extends { id: string; createdAt: string }>(left: T, right: T) {
  const comparableTimestamp = (value: string) => value.replace(
    /(?:\.(\d{1,6}))?Z$/,
    (_match, fraction: string | undefined) => `.${(fraction ?? "").padEnd(6, "0")}Z`
  );
  return comparableTimestamp(right.createdAt).localeCompare(comparableTimestamp(left.createdAt))
    || right.id.localeCompare(left.id);
}
