export function getRestoredContentArchiveValues({ publishedAt, now }: { publishedAt: Date | null; now: Date }) {
  return {
    isPublished: true,
    publishedAt: publishedAt ?? now,
    archivedUntil: null,
    updatedAt: now
  };
}
