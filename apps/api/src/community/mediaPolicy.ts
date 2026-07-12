export const communityMediaRetentionMs = 30 * 24 * 60 * 60 * 1000;

export function getCommunityMediaExpiry(role: string, createdAt = new Date()) {
  return role === "admin" || role === "owner" ? null : new Date(createdAt.getTime() + communityMediaRetentionMs);
}

export function isCommunityAttachmentExpired(
  attachment: { expiresAt: Date | null; deletedAt: Date | null },
  now = new Date()
) {
  return attachment.deletedAt === null && attachment.expiresAt !== null && attachment.expiresAt <= now;
}
