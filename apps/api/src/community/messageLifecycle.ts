export const authorMutationWindowMs = 15 * 60 * 1000;
export const deletedContentRetentionMs = 30 * 24 * 60 * 60 * 1000;

type AuthorMutableMessage = {
  userId: string;
  createdAt: Date;
  deletedByUserAt: Date | null;
};

type DeletedBodyInput = {
  moderator: boolean;
  originalBody: string;
  purged: boolean;
};

export function canAuthorMutateMessage(
  message: AuthorMutableMessage,
  userId: string,
  now = new Date()
) {
  return (
    message.userId === userId &&
    !message.deletedByUserAt &&
    now.getTime() - message.createdAt.getTime() <= authorMutationWindowMs
  );
}

export function getDeletedContentExpiry(now = new Date()) {
  return new Date(now.getTime() + deletedContentRetentionMs);
}

export function serializeDeletedBody(input: DeletedBodyInput) {
  return input.moderator && !input.purged ? input.originalBody : "Сообщение удалено";
}
