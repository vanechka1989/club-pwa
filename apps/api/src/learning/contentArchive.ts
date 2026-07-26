export function getRestoredContentArchiveValues({ publishedAt, now }: { publishedAt: Date | null; now: Date }) {
  void publishedAt;
  return {
    isPublished: false,
    publishedAt: null,
    archivedUntil: null,
    updatedAt: now
  };
}
