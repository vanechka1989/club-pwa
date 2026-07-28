export type CommunityReadPosition = {
  messageId: string;
  createdAt: Date;
};

export function advanceReadPosition<T extends CommunityReadPosition>(current: T | null, candidate: T): T {
  if (!current) {
    return candidate;
  }

  const currentCreatedAt = current.createdAt.getTime();
  const candidateCreatedAt = candidate.createdAt.getTime();

  if (
    candidateCreatedAt > currentCreatedAt ||
    (candidateCreatedAt === currentCreatedAt && candidate.messageId > current.messageId)
  ) {
    return candidate;
  }

  return current;
}
