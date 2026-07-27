export function resolveAdminPollStats<T>(incoming: T | null | undefined, current: T): T {
  return incoming ?? current;
}
