export function serializeAdminLastLoginAt(lastSeenAt: Date | null | undefined) {
  return lastSeenAt?.toISOString() ?? null;
}
