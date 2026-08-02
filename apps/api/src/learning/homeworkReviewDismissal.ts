export type HomeworkReviewDismissalRepository = {
  ownsReviewedSubmission(userId: string, submissionId: string): Promise<boolean>;
  persistDismissal(userId: string, submissionId: string): Promise<void>;
};

export async function dismissOwnedHomeworkReview(
  input: { userId: string; submissionId: string },
  repository: HomeworkReviewDismissalRepository
) {
  if (!await repository.ownsReviewedSubmission(input.userId, input.submissionId)) {
    return false;
  }

  await repository.persistDismissal(input.userId, input.submissionId);
  return true;
}
