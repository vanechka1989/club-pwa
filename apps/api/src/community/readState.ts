export type CommunityReadPosition = {
  createdAt: Date;
};

export function advanceReadPosition<T extends CommunityReadPosition>(current: T | null, candidate: T): T {
  if (!current || candidate.createdAt.getTime() > current.createdAt.getTime()) {
    return candidate;
  }

  return current;
}
