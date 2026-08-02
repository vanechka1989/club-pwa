export type HomeworkReviewNoticeRow = {
  contentItemId: string;
  status: string;
  reviewedAt: Date | null;
  reviewComment: string | null;
};

export function serializeHomeworkReviewNotice(row: HomeworkReviewNoticeRow | null | undefined) {
  if (!row?.reviewedAt || (row.status !== "needs_revision" && row.status !== "accepted")) {
    return null;
  }

  return {
    contentItemId: row.contentItemId,
    status: row.status,
    reviewComment: row.reviewComment?.trim() || null,
    reviewedAt: row.reviewedAt.toISOString()
  };
}
